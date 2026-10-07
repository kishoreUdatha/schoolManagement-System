"""The librarian's bulk work: bringing in a collection from a spreadsheet,
printing spine / barcode labels, reminding families about overdue books, and
the yearly stock check (scan the shelves, see what is missing).
"""
from __future__ import annotations

import io
import re
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import notify
from app.core.enums import CopyStatus, NotificationCategory
from app.models.library import Book, BookCopy, Loan, StockCheck, StockCheckScan
from app.models.student import Student
from app.models.tenant import School
from app.models.user import User
from app.services import library_service

MAX_COPIES = 200


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


# ---------- import ----------


def _isbn(v: str) -> str:
    return re.sub(r"[^0-9Xx]", "", v or "").upper()


def _accessions(v: str) -> list[str]:
    return [a.strip().upper() for a in re.split(r"[,;\s]+", v or "") if a.strip()]


def import_books(db: Session, user: User, rows: list[dict], dry_run: bool) -> dict:
    """Check every row, then (unless dry_run) save the good ones. A row whose
    ISBN, or title and author, is already in the catalogue adds copies to that
    book rather than a second title. Copies are numbered on from the school's
    series unless the sheet gives accession numbers."""
    sid = user.school_id
    books = list(db.execute(select(Book).where(Book.school_id == sid)).scalars())
    by_isbn = {_isbn(b.isbn): b for b in books if _isbn(b.isbn)}
    by_name = {(b.title.strip().lower(), (b.authors or "").strip().lower()): b for b in books}
    used = set(db.execute(select(BookCopy.accession_no).where(BookCopy.school_id == sid)).scalars())
    in_file: set[str] = set()
    # a title earlier in the same sheet: later rows add copies to it
    first_isbn: dict[str, int] = {}
    first_name: dict[tuple, int] = {}
    out = []
    for i, r in enumerate(rows, 1):
        errors: list[str] = []
        title = str(r.get("title") or "").strip()
        if not title:
            errors.append("No title")
        elif len(title) > 300:
            errors.append("Title is longer than 300 characters")
        nos = _accessions(str(r.get("accession_nos") or ""))
        raw = str(r.get("copies") or "").strip()
        if raw:
            try:
                copies = int(float(raw))
            except ValueError:
                copies, _ = 0, errors.append(f"Copies '{raw}' is not a number")
        else:
            copies = len(nos) or 1
        if not 0 <= copies <= MAX_COPIES:
            errors.append(f"Copies must be 0 to {MAX_COPIES}")
        if nos and len(nos) != copies:
            errors.append(f"{len(nos)} accession numbers for {copies} copies")
        for a in nos:
            if len(a) > 40:
                errors.append(f"Accession number {a[:20]}… is too long")
            elif a in used:
                errors.append(f"Accession number {a} is already in the library")
            elif a in in_file:
                errors.append(f"Accession number {a} is twice in the sheet")
        year = None
        if str(r.get("publish_year") or "").strip():
            try:
                year = int(float(str(r["publish_year"]).strip()))
                if not 1450 <= year <= 2100:
                    raise ValueError
            except ValueError:
                errors.append(f"Year '{r['publish_year']}' is not a year")
        price = None
        if str(r.get("price") or "").strip():
            try:
                price = Decimal(re.sub(r"[^\d.]", "", str(r["price"])))
            except InvalidOperation:
                errors.append(f"Price '{r['price']}' is not an amount")
        authors = str(r.get("authors") or "").strip()[:300] or None
        isbn = str(r.get("isbn") or "").strip()[:20] or None
        key_isbn, key_name = _isbn(isbn or ""), (title.lower(), (authors or "").lower())
        existing = (by_isbn.get(key_isbn) if key_isbn else None) or by_name.get(key_name)
        same_as = None if existing else ((first_isbn.get(key_isbn) if key_isbn else None) or first_name.get(key_name))
        if not errors and not existing and same_as is None:
            if key_isbn:
                first_isbn[key_isbn] = i
            first_name[key_name] = i
        out.append({"row": i, "title": title, "authors": authors, "copies": copies, "accession_nos": nos,
                    "existing_book_id": existing.id if existing else None, "same_as_row": same_as, "errors": errors,
                    "_fields": {"title": title, "authors": authors, "isbn": isbn,
                                "publisher": str(r.get("publisher") or "").strip()[:160] or None,
                                "edition": str(r.get("edition") or "").strip()[:40] or None, "publish_year": year,
                                "category": str(r.get("category") or "").strip()[:80] or None,
                                "language": str(r.get("language") or "").strip()[:40] or None,
                                "shelf": str(r.get("shelf") or "").strip()[:40] or None},
                    "_price": price})
        if not errors:
            in_file.update(nos)
    good = [o for o in out if not o["errors"]]
    summary = {"rows": len(out), "good": len(good), "with_errors": len(out) - len(good),
               "new_titles": sum(1 for o in good if not o["existing_book_id"] and not o["same_as_row"]),
               "copies": sum(o["copies"] for o in good)}
    if not dry_run and good:
        nxt = library_service._next_accession(db, sid)
        taken = used | in_file
        made: dict[int, Book] = {}
        for o in good:
            book = (db.get(Book, o["existing_book_id"]) if o["existing_book_id"]
                    else made.get(o["same_as_row"]) if o["same_as_row"] else None)
            if book is None:
                book = Book(tenant_id=user.tenant_id, school_id=sid, is_active=True, **o["_fields"])
                db.add(book)
                db.flush()
            made[o["row"]] = book
            nos = o["accession_nos"]
            if not nos:
                nos = []
                while len(nos) < o["copies"]:
                    a = f"A{nxt:06d}"
                    nxt += 1
                    if a not in taken:
                        nos.append(a)
                        taken.add(a)
            for a in nos:
                db.add(BookCopy(school_id=sid, book_id=book.id, accession_no=a, status=CopyStatus.available,
                                price=o["_price"], acquired_on=date.today()))
            o["accession_nos"] = nos
        db.commit()
        summary["saved"] = True
    for o in out:
        o.pop("_fields")
        o.pop("_price")
    return {"summary": summary, "rows": out}


# ---------- labels ----------


def _label_copies(db: Session, school_id: int, *, copy_ids: Optional[list[int]], book_id: Optional[int],
                  from_no: Optional[str], to_no: Optional[str], since: Optional[date]) -> list[tuple[BookCopy, Book]]:
    q = (select(BookCopy, Book).join(Book, Book.id == BookCopy.book_id)
         .where(BookCopy.school_id == school_id, BookCopy.status.not_in((CopyStatus.withdrawn, CopyStatus.lost))))
    if copy_ids:
        q = q.where(BookCopy.id.in_(copy_ids))
    if book_id:
        q = q.where(BookCopy.book_id == book_id)
    if since:
        q = q.where(BookCopy.acquired_on >= since)
    rows = list(db.execute(q.order_by(BookCopy.accession_no)).all())
    if from_no or to_no:
        lo, hi = (from_no or "").strip().upper(), (to_no or "").strip().upper()
        # A000012 sorts with A000100 only when the widths match: compare the number when both are numbered
        def key(a: str):
            m = re.match(r"^([A-Z]*)(\d+)$", a)
            return (m.group(1), int(m.group(2))) if m else (a, -1)
        rows = [r for r in rows if (not lo or key(r[0].accession_no) >= key(lo)) and (not hi or key(r[0].accession_no) <= key(hi))]
    return rows


def labels_pdf(db: Session, school_id: int, **filters) -> tuple[bytes, int]:
    """A4 sheets of 24 labels (3 × 8, 63.5 × 33.9 mm, the common sticker
    sheet): the school, the title, a Code 128 barcode of the accession number
    and the number under it, and the shelf."""
    from reportlab.graphics.barcode import code128
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    rows = _label_copies(db, school_id, **filters)
    if not rows:
        raise _400("No copies match: choose a book, a range of accession numbers or a date")
    if len(rows) > 2400:
        raise _400("That is more than 100 sheets: print a smaller range")
    school = db.get(School, school_id)
    name = (school.name if school else "Library")[:40]
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    lw, lh, cols, per_page = 63.5 * mm, 33.9 * mm, 3, 24
    left, top = (w - cols * lw - 2 * 2.5 * mm) / 2, (h - 8 * lh) / 2
    for i, (cp, book) in enumerate(rows):
        if i and i % per_page == 0:
            c.showPage()
        k = i % per_page
        x = left + (k % cols) * (lw + 2.5 * mm)
        y = h - top - (k // cols + 1) * lh
        c.setFont("Helvetica", 6.5)
        c.drawString(x + 3 * mm, y + lh - 4.5 * mm, name)
        title = book.title if len(book.title) <= 42 else book.title[:41] + "…"
        c.setFont("Helvetica-Bold", 7.5)
        c.drawString(x + 3 * mm, y + lh - 8 * mm, title)
        bc = code128.Code128(cp.accession_no, barHeight=10 * mm, barWidth=0.33 * mm, humanReadable=False)
        bc.drawOn(c, x + (lw - bc.width) / 2, y + 8.5 * mm)
        c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(x + lw / 2, y + 4.5 * mm, cp.accession_no)
        if book.shelf:
            c.setFont("Helvetica", 6.5)
            c.drawRightString(x + lw - 3 * mm, y + lh - 4.5 * mm, f"Shelf {book.shelf}"[:20])
    c.save()
    return buf.getvalue(), len(rows)


# ---------- overdue reminders ----------


def remind_overdue(db: Session, user: User) -> dict:
    """One in-app notice per family (their children's late books together)
    and per member of staff, with the days late and the fine so far."""
    today = date.today()
    cfg = library_service.get_settings(db, user.tenant_id, user.school_id)
    loans = list(db.execute(
        select(Loan, Book.title).join(BookCopy, BookCopy.id == Loan.copy_id).join(Book, Book.id == BookCopy.book_id)
        .where(Loan.school_id == user.school_id, Loan.returned_on.is_(None), Loan.lost_on.is_(None), Loan.due_on < today)
        .order_by(Loan.due_on)
    ).all())
    by_student: dict[int, list[str]] = {}
    by_staff: dict[int, list[str]] = {}
    for loan, title in loans:
        days, fine = library_service._fine_for(loan, today, cfg)
        line = f"{title}: due {loan.due_on:%d %b}, {days} day{'s' if days != 1 else ''} late" + (f", fine so far Rs {fine:,.0f}" if fine else "")
        if loan.student_id:
            by_student.setdefault(loan.student_id, []).append(line)
        elif loan.user_id:
            by_staff.setdefault(loan.user_id, []).append(line)
    families = 0
    for sid, lines in by_student.items():
        st = db.get(Student, sid)
        if not st:
            continue
        sent = notify.student_parents(
            db, st, f"Library: {st.full_name.split()[0]} has {'a book' if len(lines) == 1 else f'{len(lines)} books'} overdue",
            "Please return " + ("it" if len(lines) == 1 else "them") + " to the school library.\n" + "\n".join(lines),
            category=NotificationCategory.general, link="/parent/library-loans")
        families += 1 if sent else 0
    if by_staff:
        for uid, lines in by_staff.items():
            notify.staff_users(db, tenant_id=user.tenant_id, school_id=user.school_id, user_ids=[uid],
                               title="Library: overdue book" + ("s" if len(lines) > 1 else ""), body="\n".join(lines))
    db.commit()
    return {"books": len(loans), "students": len(by_student), "families_told": families, "staff_told": len(by_staff)}


# ---------- stock check ----------


def _check(db: Session, school_id: int, check_id: int) -> StockCheck:
    c = db.get(StockCheck, check_id)
    if not c or c.school_id != school_id:
        raise _404("Stock check")
    return c


def start_check(db: Session, user: User, note: Optional[str]) -> StockCheck:
    if db.execute(select(StockCheck.id).where(StockCheck.school_id == user.school_id, StockCheck.closed_at.is_(None))).first():
        raise _400("A stock check is already open: finish or close it first")
    c = StockCheck(tenant_id=user.tenant_id, school_id=user.school_id, started_by_user_id=user.id, note=(note or "").strip()[:200] or None)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def scan(db: Session, user: User, check_id: int, accession_nos: list[str], shelf: Optional[str]) -> dict:
    c = _check(db, user.school_id, check_id)
    if c.closed_at:
        raise _400("This stock check is closed")
    copies = {cp.accession_no: cp for cp in db.execute(select(BookCopy).where(BookCopy.school_id == user.school_id)).scalars()}
    seen = set(db.execute(select(StockCheckScan.accession_no).where(StockCheckScan.check_id == c.id)).scalars())
    added, repeated, unknown = 0, 0, []
    for raw in accession_nos:
        a = raw.strip().upper()
        if not a:
            continue
        if a in seen:
            repeated += 1
            continue
        cp = copies.get(a)
        db.add(StockCheckScan(check_id=c.id, school_id=user.school_id, accession_no=a[:40], copy_id=cp.id if cp else None,
                              shelf=(shelf or "").strip()[:40] or None, scanned_by_user_id=user.id))
        seen.add(a)
        added += 1
        if not cp:
            unknown.append(a)
    db.commit()
    return {"added": added, "already_scanned": repeated, "unknown": unknown}


def unscan(db: Session, user: User, check_id: int, accession_no: str) -> None:
    c = _check(db, user.school_id, check_id)
    if c.closed_at:
        raise _400("This stock check is closed")
    s = db.execute(select(StockCheckScan).where(StockCheckScan.check_id == c.id, StockCheckScan.accession_no == accession_no.strip().upper())).scalar_one_or_none()
    if s:
        db.delete(s)
        db.commit()


def check_detail(db: Session, user: User, check_id: int) -> dict:
    """What the shelves showed against the catalogue: missing copies (not on
    loan and not found), copies out on loan, books found that the catalogue
    has as lost, books found that the catalogue has on loan, and numbers that
    are not in the catalogue at all."""
    c = _check(db, user.school_id, check_id)
    scans = list(db.execute(select(StockCheckScan).where(StockCheckScan.check_id == c.id).order_by(StockCheckScan.id.desc())).scalars())
    scanned = {s.copy_id for s in scans if s.copy_id}
    rows = db.execute(select(BookCopy, Book).join(Book, Book.id == BookCopy.book_id)
                      .where(BookCopy.school_id == user.school_id, BookCopy.status != CopyStatus.withdrawn)
                      .order_by(BookCopy.accession_no)).all()

    def item(cp: BookCopy, b: Book) -> dict:
        return {"copy_id": cp.id, "accession_no": cp.accession_no, "title": b.title, "authors": b.authors, "shelf": b.shelf, "status": cp.status.value}

    missing, on_loan, found_lost, found_on_loan = [], [], [], []
    for cp, b in rows:
        here = cp.id in scanned
        if cp.status in (CopyStatus.available, CopyStatus.on_hold, CopyStatus.damaged) and not here:
            missing.append(item(cp, b))
        elif cp.status == CopyStatus.issued:
            (found_on_loan if here else on_loan).append(item(cp, b))
        elif cp.status == CopyStatus.lost and here:
            found_lost.append(item(cp, b))
    expected = sum(1 for cp, _ in rows if cp.status in (CopyStatus.available, CopyStatus.on_hold, CopyStatus.damaged, CopyStatus.issued))
    return {
        "id": c.id, "started_at": c.started_at, "closed_at": c.closed_at, "note": c.note,
        "counts": {"copies": expected, "scanned": len(scans), "missing": len(missing), "on_loan": len(on_loan),
                   "found_lost": len(found_lost), "found_on_loan": len(found_on_loan), "unknown": sum(1 for s in scans if not s.copy_id)},
        "missing": missing, "on_loan": on_loan, "found_lost": found_lost, "found_on_loan": found_on_loan,
        "unknown": [s.accession_no for s in scans if not s.copy_id],
        "recent": [{"accession_no": s.accession_no, "known": bool(s.copy_id), "shelf": s.shelf} for s in scans[:15]],
    }


def mark_missing_lost(db: Session, user: User, check_id: int, copy_ids: list[int]) -> dict:
    """Copies the shelves didn't show, that nobody has on loan: written off as lost."""
    c = _check(db, user.school_id, check_id)
    missing = {m["copy_id"] for m in check_detail(db, user, c.id)["missing"]}
    n = 0
    for cid in copy_ids:
        if cid not in missing:
            continue
        cp = db.get(BookCopy, cid)
        cp.status = CopyStatus.lost
        cp.condition_note = f"Not found in the stock check of {c.started_at:%d %b %Y}"[:300]
        n += 1
    db.commit()
    return {"marked_lost": n}


def mark_found(db: Session, user: User, check_id: int, copy_ids: list[int]) -> dict:
    """Copies the catalogue had as lost that turned up on the shelf: back in stock."""
    c = _check(db, user.school_id, check_id)
    found = {m["copy_id"] for m in check_detail(db, user, c.id)["found_lost"]}
    n = 0
    for cid in copy_ids:
        if cid in found:
            db.get(BookCopy, cid).status = CopyStatus.available
            n += 1
    db.commit()
    return {"back_in_stock": n}


def close_check(db: Session, user: User, check_id: int) -> StockCheck:
    c = _check(db, user.school_id, check_id)
    if not c.closed_at:
        c.closed_at = datetime.now(timezone.utc)
        c.closed_by_user_id = user.id
        db.commit()
    return c


def list_checks(db: Session, school_id: int) -> list[dict]:
    rows = db.execute(select(StockCheck).where(StockCheck.school_id == school_id).order_by(StockCheck.id.desc())).scalars().all()
    counts = {}
    for cid, in db.execute(select(StockCheckScan.check_id).where(StockCheckScan.school_id == school_id)).all():
        counts[cid] = counts.get(cid, 0) + 1
    return [{"id": c.id, "started_at": c.started_at, "closed_at": c.closed_at, "note": c.note, "scanned": counts.get(c.id, 0)} for c in rows]

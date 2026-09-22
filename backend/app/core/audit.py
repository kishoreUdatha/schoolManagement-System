"""Story 22.1 — Audit log capture.

Two SQLAlchemy session events do the work:

* `before_flush` captures old/new diffs for UPDATEs and snapshots of DELETEs
  (the history would be wiped after flush). For CREATEs we only record a
  reference to the instance so we can pick up the auto-generated PK after
  the flush emits the INSERT.

* `after_flush` finalizes entity_id for CREATEs (PKs are now assigned by
  the DB) and adds the AuditLog rows. Those new rows are persisted on the
  next flush — which commit() triggers automatically — so everything lands
  in the same transaction.
"""
from __future__ import annotations

import contextvars
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Optional

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session


class _Actor:
    user_id: Optional[int] = None
    tenant_id: Optional[int] = None
    school_id: Optional[int] = None
    request_path: Optional[str] = None

    def __init__(
        self,
        user_id: Optional[int] = None,
        tenant_id: Optional[int] = None,
        school_id: Optional[int] = None,
        request_path: Optional[str] = None,
    ) -> None:
        self.user_id = user_id
        self.tenant_id = tenant_id
        self.school_id = school_id
        self.request_path = request_path


_actor: contextvars.ContextVar[_Actor] = contextvars.ContextVar(
    "audit_actor", default=_Actor()
)


def set_audit_actor(
    *,
    user_id: Optional[int] = None,
    tenant_id: Optional[int] = None,
    school_id: Optional[int] = None,
    request_path: Optional[str] = None,
) -> contextvars.Token[_Actor]:
    return _actor.set(
        _Actor(
            user_id=user_id,
            tenant_id=tenant_id,
            school_id=school_id,
            request_path=request_path,
        )
    )


def clear_audit_actor(token: contextvars.Token[_Actor]) -> None:
    _actor.reset(token)


def _get_actor() -> _Actor:
    return _actor.get()


# ----- Snapshot helpers -----

_IGNORE_COLUMNS = {"updated_at", "created_at", "password_hash"}


def _to_jsonable(v: Any) -> Any:
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    if isinstance(v, Decimal):
        return str(v)
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, Enum):
        return v.value
    if isinstance(v, (list, tuple)):
        return [_to_jsonable(x) for x in v]
    if isinstance(v, dict):
        return {k: _to_jsonable(x) for k, x in v.items()}
    return str(v)


def _snapshot(instance: Any) -> dict:
    state = inspect(instance)
    out: dict = {}
    for attr in state.attrs:
        key = attr.key
        if key in _IGNORE_COLUMNS:
            continue
        out[key] = _to_jsonable(attr.value)
    return out


def _diff(instance: Any) -> tuple[dict, dict]:
    old: dict = {}
    new: dict = {}
    state = inspect(instance)
    for attr in state.attrs:
        key = attr.key
        if key in _IGNORE_COLUMNS:
            continue
        history = attr.history
        if not history.has_changes():
            continue
        new_val = history.added[0] if history.added else None
        old_val = history.deleted[0] if history.deleted else None
        new[key] = _to_jsonable(new_val)
        old[key] = _to_jsonable(old_val)
    return old, new


def _is_audited(instance: Any) -> bool:
    return getattr(type(instance), "__audited__", False) is True


def _entity_type(instance: Any) -> str:
    return type(instance).__name__


def _session_actor(session: Session) -> _Actor:
    """Read actor stashed on session.info by the request dep, falling back to
    the ContextVar for non-request callers (scripts, background jobs)."""
    info = session.info.get("audit_actor") if session.info else None
    if info:
        return _Actor(
            user_id=info.get("user_id"),
            tenant_id=info.get("tenant_id"),
            school_id=info.get("school_id"),
            request_path=info.get("request_path"),
        )
    return _get_actor()


def _base_kwargs(actor: _Actor, inst: Any) -> dict:
    return {
        "user_id": actor.user_id,
        "tenant_id": actor.tenant_id or getattr(inst, "tenant_id", None),
        "school_id": actor.school_id or getattr(inst, "school_id", None),
        "request_path": actor.request_path,
    }


_METHOD_ACTION = {"POST": "create", "PUT": "update", "PATCH": "update", "DELETE": "delete"}
_REFUSALS = {400, 403, 404, 409}


def record_refused_write(db: Session, exc: BaseException) -> None:
    """Log a refused write (POST/PUT/PATCH/DELETE answered 400/403/404/409)
    by a signed-in user as a failed attempt. Never raises: the refusal the
    user sees matters more than the log line."""
    status_code = getattr(exc, "status_code", None)
    actor = db.info.get("audit_actor") or {}
    method = actor.get("request_method")
    if status_code not in _REFUSALS or method not in _METHOD_ACTION or not actor.get("user_id"):
        return
    try:
        from app.core.enums import AuditAction
        from app.models.audit import AuditLog

        path = actor.get("request_path") or ""
        parts = [p for p in path.split("/") if p]
        # /api/v1/<portal>/<area>/<thing>/... -> "<area>/<thing>" (ids dropped)
        words = [p for p in parts[3:] if not p.isdigit()][:2]
        ids = [int(p) for p in parts[3:] if p.isdigit()]
        detail = getattr(exc, "detail", None)
        db.rollback()
        db.add(AuditLog(
            tenant_id=actor.get("tenant_id"), school_id=actor.get("school_id"), user_id=actor.get("user_id"),
            action=AuditAction(_METHOD_ACTION[method]), entity_type=("/".join(words) or "request")[:80],
            entity_id=ids[0] if ids else None, request_path=path[:255], result="failed",
            new_values={"status": status_code, "detail": detail if isinstance(detail, (str, list, dict)) else str(detail)},
        ))
        db.commit()
    except Exception:  # noqa: BLE001 — the log must not turn a 403 into a 500
        db.rollback()


# Key under which we stash the half-built audit records on the session
_PENDING_KEY = "_audit_pending"


def before_flush(session: Session, flush_context, instances) -> None:  # noqa: ARG001
    actor = _session_actor(session)
    pending: list[tuple[dict, Optional[Any]]] = session.info.setdefault(
        _PENDING_KEY, []
    )

    # CREATEs — capture snapshot now; PK will be assigned by flush
    for inst in list(session.new):
        if not _is_audited(inst):
            continue
        try:
            new = _snapshot(inst)
        except Exception:
            new = {}
        kwargs = _base_kwargs(actor, inst)
        kwargs.update(
            {
                "action": "create",
                "entity_type": _entity_type(inst),
                "entity_id": None,  # finalized in after_flush
                "old_values": None,
                "new_values": new,
            }
        )
        pending.append((kwargs, inst))

    # UPDATEs — history must be captured before flush wipes it
    for inst in list(session.dirty):
        if not _is_audited(inst):
            continue
        if not session.is_modified(inst, include_collections=False):
            continue
        try:
            old, new = _diff(inst)
        except Exception:
            old, new = {}, {}
        if not old and not new:
            continue
        kwargs = _base_kwargs(actor, inst)
        kwargs.update(
            {
                "action": "update",
                "entity_type": _entity_type(inst),
                "entity_id": getattr(inst, "id", None),
                "old_values": old,
                "new_values": new,
            }
        )
        pending.append((kwargs, None))  # no need to revisit after flush

    # DELETEs — snapshot the soon-to-be-gone row
    for inst in list(session.deleted):
        if not _is_audited(inst):
            continue
        try:
            old = _snapshot(inst)
        except Exception:
            old = {}
        kwargs = _base_kwargs(actor, inst)
        kwargs.update(
            {
                "action": "delete",
                "entity_type": _entity_type(inst),
                "entity_id": getattr(inst, "id", None),
                "old_values": old,
                "new_values": None,
            }
        )
        pending.append((kwargs, None))


def after_flush(session: Session, flush_context) -> None:  # noqa: ARG001
    from app.models.audit import AuditLog  # avoid circular import at module load

    pending = session.info.pop(_PENDING_KEY, [])
    if not pending:
        return
    for kwargs, source in pending:
        if source is not None and kwargs.get("entity_id") is None:
            kwargs["entity_id"] = getattr(source, "id", None)
            # For CREATE, re-snapshot now that PKs/defaults are populated
            try:
                kwargs["new_values"] = _snapshot(source)
            except Exception:
                pass
        session.add(AuditLog(**kwargs))


def install() -> None:
    if getattr(install, "_installed", False):
        return
    event.listen(Session, "before_flush", before_flush)
    event.listen(Session, "after_flush", after_flush)
    install._installed = True  # type: ignore[attr-defined]

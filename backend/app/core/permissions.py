"""The catalogue of permissions a school can grant to a custom role.

Permissions are additive: an endpoint allows its usual roles, or anyone whose
roles carry the permission. That way a school can delegate a job (say, letting
the office approve refunds) without changing any code, and nothing a school
relies on today stops working.

Adding a code here and using `deps.allow(...)` on an endpoint is all it takes.
"""

# code -> (module, name, what it lets someone do)
CATALOGUE: dict[str, tuple[str, str, str]] = {
    # people
    "students.manage": ("Students", "Manage students", "Add, edit and deactivate students"),
    "parents.manage": ("Students", "Manage parent logins", "Create parent logins and link them to children"),
    "staff.manage": ("Staff", "Manage staff", "Add and edit staff records and logins"),
    # admissions
    "admissions.manage": ("Admissions", "Handle admissions", "Work on enquiries and applications"),
    "admissions.decide": ("Admissions", "Approve or reject applications", "Decide an application and admit the student"),
    # academics
    "syllabus.manage": ("Academics", "Manage the syllabus", "Edit chapters and topics for any subject"),
    "lessonplans.review": ("Academics", "Review lesson plans", "Approve or return teachers' lesson plans"),
    "exams.manage": ("Exams", "Manage exams", "Create exams and papers"),
    "exams.approve_results": ("Exams", "Approve results", "Sign off results before they are published"),
    "grading.manage": ("Exams", "Manage grading", "Edit grade scales, exam types and report card settings"),
    "reportcards.remark": ("Exams", "Write report card remarks", "Add the class teacher or principal remark"),
    # attendance & timetable
    "attendance.correct": ("Attendance", "Correct attendance", "Edit attendance outside the normal window"),
    "studentleave.decide": ("Attendance", "Decide student leave", "Approve or reject leave requested by parents"),
    "cover.manage": ("Timetable", "Arrange cover", "Assign substitutes when a teacher is away"),
    # money
    "fees.manage": ("Fees", "Manage fees", "Fee heads, structures and generating fees"),
    "fees.collect": ("Fees", "Collect fees", "Record payments and print receipts"),
    "fees.waive": ("Fees", "Waive fees", "Write off or discount a fee"),
    "fees.refund.request": ("Fees", "Request refunds", "Raise a refund for a parent"),
    "fees.refund.approve": ("Fees", "Approve refunds", "Approve or reject a refund request"),
    "accounts.manage": ("Accounts", "Manage accounts", "Expenses, other income and the cash book"),
    "payroll.manage": ("Payroll", "Run payroll", "Create, finalise and pay payroll runs"),
    # pastoral
    "discipline.manage": ("Pastoral", "Handle discipline", "Record actions and close incidents"),
    "discipline.share": ("Pastoral", "Share incidents with parents", "Decide what parents are told"),
    "counselling.access": ("Pastoral", "Access counselling cases", "Read and write counselling notes"),
    "health.manage": ("Pastoral", "Manage health records", "Clinic visits, checkups and immunisations"),
    # operations
    "transport.manage": ("Operations", "Manage transport", "Routes, vehicles, trips and assignments"),
    "library.manage": ("Operations", "Manage the library", "Books, copies, issues and returns"),
    "hostel.manage": ("Operations", "Manage the hostel", "Rooms, allocations and roll call"),
    "inventory.manage": ("Operations", "Manage inventory", "Stock, assets and the school store"),
    "frontdesk.manage": ("Operations", "Run the front desk", "Visitors, gate passes and early pickup"),
    # communication
    "notices.send": ("Communication", "Send notices", "Publish notices to parents and staff"),
    "events.manage": ("Communication", "Manage events", "Events, meetings and the photo gallery"),
    # school setup & security
    "settings.manage": ("Settings", "Change school settings", "School profile, classes, subjects and periods"),
    "roles.manage": ("Settings", "Manage roles", "Create roles, set permissions and assign them"),
    "branches.manage": ("Settings", "Manage branches", "Add campuses and assign sections and staff"),
    "hr.manage": ("Settings", "Manage HR", "Recruitment and leave entitlement"),
    "reports.view": ("Reports", "See reports", "Attendance, fees and other school reports"),
    "audit.view": ("Settings", "See the audit log", "Read the record of who changed what"),
}

# what each built-in role can do out of the box. The school admin gets
# everything, so it isn't listed here.
SYSTEM_ROLE_PERMISSIONS: dict[str, list[str]] = {
    "principal": [
        "admissions.manage", "admissions.decide", "syllabus.manage", "lessonplans.review", "exams.manage",
        "exams.approve_results", "grading.manage", "reportcards.remark", "attendance.correct",
        "studentleave.decide", "cover.manage", "discipline.manage", "discipline.share", "counselling.access",
        "notices.send", "events.manage", "reports.view", "fees.refund.approve", "hr.manage",
    ],
    "accountant": ["fees.manage", "fees.collect", "fees.waive", "fees.refund.request", "accounts.manage",
                   "payroll.manage", "inventory.manage", "reports.view"],
    "teacher": ["reportcards.remark", "notices.send"],
    "staff": ["frontdesk.manage", "library.manage", "inventory.manage", "hostel.manage"],
    "parent": [],
    "student": [],
}

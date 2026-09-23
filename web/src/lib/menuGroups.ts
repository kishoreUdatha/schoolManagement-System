// Screens that share one menu entry and switch with a row of tabs on the page.
// The menu lists only the group's first screen, under the group's name; the
// others stay out of the menu (ModuleGroup) and appear as tabs (AppShell).
//
// The wording here is the school's, not the system's: "Fee types", not "fee
// heads"; "Exam duty", not "invigilation". A label is one to three words; a
// note (SCREEN_NOTE, below) is one plain line saying what the screen does.

export type TabGroup = { label: string; tabs: [number, string][] };

export const TAB_GROUPS: TabGroup[] = [
  // Admissions
  { label: "Enquiries", tabs: [[44, "Enquiries"], [47, "Follow-ups"], [1002, "Campaigns"], [1001, "Admission link"]] },
  { label: "Applications", tabs: [[48, "Applications"], [51, "Documents"], [52, "Entrance test"], [53, "Approval"], [54, "Confirmation"]] },
  // Students and their families
  { label: "Students", tabs: [[55, "Directory"], [1010, "Bulk import"], [1011, "Logins"], [1012, "Enrolment history"], [69, "Promotion"], [70, "Exit & alumni"]] },
  { label: "Parents", tabs: [[71, "Directory"], [75, "Contact preferences"], [77, "Meetings & calls"], [78, "Payments"]] },
  // Staff
  { label: "Staff", tabs: [[80, "Directory"], [1085, "Departments"], [84, "Class teachers"], [85, "Subjects & classes"], [86, "Workload"], [87, "Qualifications"], [90, "Class observations"], [91, "Exit"]] },
  { label: "Hiring", tabs: [[172, "Hiring requests"], [173, "Job openings"], [174, "Candidates"], [1060, "Candidate pool"], [176, "Interviews"], [177, "Offers"], [178, "Joining checklist"]] },
  { label: "Staff attendance & leave", tabs: [[179, "Attendance"], [88, "Attendance summary"], [180, "Leave policies"], [181, "Leave requests"], [182, "Leave approval"], [1061, "Balances"], [89, "Leave summary"]] },
  { label: "Payroll", tabs: [[183, "Setup"], [184, "Run payroll"], [185, "Payslips"], [1062, "Salary history"]] },
  { label: "My records", tabs: [[1090, "My attendance"], [1091, "My leave"], [1092, "My payslips"]] },
  // Academics
  { label: "School structure", tabs: [[92, "Academic years"], [93, "Terms"], [94, "Classes"], [95, "Sections"], [96, "Subjects"], [97, "Subject groups"], [107, "Rooms"], [1020, "Holidays"]] },
  { label: "Curriculum", tabs: [[98, "Curriculum"], [100, "Units & topics"], [101, "Learning outcomes"], [102, "Lesson plans"], [104, "Approve plans"], [105, "Syllabus progress"], [106, "Resources"]] },
  // Attendance
  { label: "Registers", tabs: [[111, "Period attendance"], [112, "Register"], [113, "Corrections"], [1030, "Lock registers"], [1031, "Missing from class"], [116, "Late & early exit"]] },
  { label: "Attendance reports", tabs: [[117, "Monthly summary"], [118, "Frequent absentees"], [119, "Reports"]] },
  // Timetable
  { label: "Timetable", tabs: [[121, "Setup"], [122, "Periods"], [123, "Teacher availability"], [124, "Generate"], [125, "Class timetable"], [126, "Teacher timetable"]] },
  // Examinations
  { label: "Exam setup", tabs: [[139, "Exam types"], [140, "Exams"], [141, "Schedule"], [142, "Exam seating"], [143, "Exam duty"], [144, "Admit cards"]] },
  { label: "Marks", tabs: [[146, "Practical marks"], [148, "Sign-off"], [1050, "Result decisions"], [149, "Grading scale"]] },
  { label: "Results", tabs: [[150, "Publish"], [151, "Student result"], [152, "Report card"], [1051, "Printing"], [153, "Promotion decision"]] },
  { label: "Online tests", tabs: [[1023, "Tests"], [1022, "Question bank"], [1024, "Results"]] },
  // Fees and finance
  { label: "Fee setup", tabs: [[155, "Fee structure"], [1040, "Fee types"], [157, "Per-student fees"], [1041, "Generate fees"], [163, "Discounts & scholarships"], [164, "Late fee rules"], [1042, "Waive & adjust"], [1043, "Online payment setup"]] },
  { label: "Fee collection", tabs: [[158, "Collect fees"], [160, "Receipts"], [159, "Online payments"], [1044, "Match payments"], [1045, "Cheques"], [161, "Student ledger"], [162, "Outstanding dues"], [165, "Refunds"]] },
  { label: "Accounts", tabs: [[166, "Income"], [167, "Expenses"], [1046, "Expense categories"], [168, "Vendors"], [169, "Purchases"], [1047, "Purchase orders"], [170, "Cash & bank"]] },
  // Transport
  { label: "Vehicles", tabs: [[186, "Vehicles"], [192, "Drivers & conductors"], [197, "Maintenance & fuel"]] },
  { label: "Routes", tabs: [[189, "Routes"], [191, "Stops"], [193, "Student routes"]] },
  { label: "Daily trips", tabs: [[194, "Trip sheets"], [196, "Boarding"], [195, "Live tracking"]] },
  // Library
  { label: "Books", tabs: [[198, "Books"], [206, "Digital library"], [201, "Members"], [1073, "Settings"]] },
  { label: "Issue & return", tabs: [[202, "Issue"], [203, "Return"], [204, "Renew & reserve"], [205, "Fines & lost books"]] },
  // Communication
  { label: "Messages", tabs: [[252, "Announcements"], [253, "Inbox"], [254, "Bulk messages"], [255, "History"], [296, "Notifications"]] },
  { label: "Events & PTM", tabs: [[246, "Calendar"], [249, "Field trips"], [250, "PTM setup"], [251, "PTM slots"]] },
  { label: "Parent desk", tabs: [[1026, "Help desk"], [1027, "Surveys"]] },
  // Reports
  { label: "School reports", tabs: [[265, "Admissions"], [266, "Strength"], [267, "Demographics"], [268, "Attendance"], [269, "Frequent absentees"], [270, "Performance"], [271, "Subjects"], [272, "Exam results"], [278, "Teacher activity"]] },
  { label: "Office reports", tabs: [[273, "Fee collection"], [274, "Outstanding dues"], [275, "Finance summary"], [277, "Payroll"], [276, "Staff attendance"], [279, "Transport"], [280, "Library"], [281, "Inventory"], [282, "Communication"]] },
  // Hostel
  { label: "Hostel setup", tabs: [[208, "Hostels"], [209, "Rooms & beds"], [211, "Wardens"]] },
  { label: "Residents", tabs: [[210, "Room allocation"], [212, "Attendance"], [213, "Leave & outings"], [215, "Complaints & fees"]] },
  // Health and wellbeing
  { label: "Clinic", tabs: [[218, "Clinic visits"], [217, "Medical profiles"], [219, "Medication"], [220, "Vaccines & allergies"], [1071, "Check-ups"], [225, "Emergency contacts"]] },
  { label: "Counselling", tabs: [[221, "Appointments"], [222, "Case notes"]] },
  { label: "Discipline", tabs: [[223, "Incidents"], [224, "Follow-up"], [1094, "Behaviour notes"]] },
  // Campus security
  { label: "Visitors", tabs: [[227, "Check-in"], [228, "Approval"], [229, "Passes"], [230, "Check-out"], [1070, "Directory"]] },
  { label: "Gate", tabs: [[231, "Early pickup"], [232, "Gate log"], [233, "Incidents"]] },
  // Inventory and labs
  { label: "Stock", tabs: [[235, "Items"], [236, "Stock in"], [237, "Issue & return"], [238, "Suppliers"], [1048, "Store sales"]] },
  { label: "Assets", tabs: [[239, "Register"], [240, "Who has what"], [241, "Maintenance"]] },
  { label: "Labs", tabs: [[242, "Labs"], [243, "Equipment"], [244, "Bookings"]] },
  // Documents and certificates
  { label: "Documents", tabs: [[256, "All files"], [257, "Student documents"], [258, "Staff documents"], [259, "Upload & verify"]] },
  { label: "Certificates", tabs: [[261, "Generate"], [260, "Templates"], [262, "Transfer certificate"], [263, "Issued certificates"]] },

  {
    label: "Users & roles",
    tabs: [[284, "Users"], [285, "Roles"], [286, "Permissions"], [287, "Compare roles"], [288, "Extra roles"]],
  },
  {
    label: "Preferences",
    tabs: [[290, "Academic"], [291, "Notifications"], [1082, "WhatsApp"], [292, "Integrations"], [293, "Security"]],
  },
  {
    label: "Data & audit",
    tabs: [[294, "Audit log"], [295, "Import & export"], [1081, "Data exports"]],
  },
];

/** The group a screen belongs to, if any. */
export function tabGroupOf(n: number | undefined): TabGroup | undefined {
  return n === undefined ? undefined : TAB_GROUPS.find((g) => g.tabs.some(([t]) => t === n));
}

/** Menu names that differ from the screen's own name. */
export const MENU_LABEL: Record<number, string> = {
  25: "Branches",
  43: "Admissions dashboard",
  108: "School calendar",
  109: "Clubs & activities",
  110: "Daily attendance",
  115: "Student leave",
  120: "Timetable overview",
  127: "Cover & substitutions",
  133: "Homework marking",
  136: "Assignment submissions",
  137: "Assignment marking",
  138: "Exam dashboard",
  145: "Marks entry",
  147: "Bulk marks import",
  154: "Fee dashboard",
  171: "Finance reports",
  207: "Library reports",
  214: "Mess & canteen menu",
  216: "Health dashboard",
  226: "Visitor dashboard",
  234: "Stock overview",
  245: "Stock reports",
  264: "School overview",
  283: "Build a report",
  289: "School setup",
  1021: "Marking guides",
  1025: "Photos & videos",
  1072: "Transport overview",
  1080: "Approvals",
  1083: "WhatsApp & SMS",
  1093: "My library books",
  1095: "Weekly reports",
  ...Object.fromEntries(TAB_GROUPS.map((g) => [g.tabs[0][0], g.label])),
};

/**
 * One plain line under the page title, for screens whose name does not say
 * what they are for. Kept short and honest: what the screen actually does,
 * not what it is called. Screens with an obvious name have no entry, and
 * dashboards never show one (they have no page head).
 */
export const SCREEN_NOTE: Record<number, string> = {
  // Admissions
  44: "Families who have asked about a seat, before they apply.",
  47: "Enquiries with a call or visit due.",
  51: "Check the papers sent with an application.",
  52: "Record entrance test results for applicants.",
  53: "Decide who is offered a seat.",
  54: "Confirm the seat and create the student record.",
  1001: "The public link families use to apply online.",
  1002: "Outreach drives an enquiry can be tagged to.",
  // Students and parents
  69: "Move children up to their next class at the end of the year.",
  70: "Close the record when a child leaves, and keep them as alumni.",
  75: "How each family wants to be contacted.",
  77: "A record of what parents and teachers discussed.",
  1011: "Switch a student's login on, or reset a password.",
  1012: "Which class a child was in, year by year.",
  // Staff
  84: "Who teaches what, and the class teacher of each section.",
  85: "The subjects a class takes and who teaches each.",
  86: "Periods and duties each teacher carries against their capacity.",
  90: "Notes from watching a teacher's lesson.",
  172: "Ask for a post to be filled, and have it approved.",
  178: "What a new joiner must finish in their first days.",
  1061: "Leave left for each person this year.",
  1062: "Past months' salaries, and the bank file to pay them.",
  // Academics
  101: "What a child should be able to do by the end of a topic.",
  104: "Approve or send back the lesson plans teachers submitted.",
  105: "How much of the syllabus each class has covered.",
  108: "Events, holidays, exams and meetings on one calendar.",
  1021: "The points a piece of work is marked against.",
  1095: "A short weekly note home on each child's week.",
  // Attendance
  110: "Mark the day's register for a section.",
  113: "Fix a register after the day is closed.",
  115: "Decide the leave a parent has asked for.",
  116: "Late arrivals and early departures on the day's register.",
  118: "Children below the attendance mark, and who has rung home.",
  1030: "Close the day's registers so marks can no longer change, or reopen one.",
  1031: "Children present in the morning but absent from a later lesson.",
  // Timetable
  123: "When a teacher cannot be given a lesson.",
  124: "Build the week's timetable from the subjects and periods set.",
  127: "Lessons left by absent teachers, and who takes them.",
  // Examinations
  142: "Which room each paper is written in, and where each child sits.",
  143: "Which teacher watches which exam room.",
  146: "Marks for the parts of a paper; the total is their sum.",
  148: "Sign off a subject's marks. Not by whoever entered them.",
  149: "How marks become grades.",
  153: "Pass or repeat, suggested from the marks. The move itself is made on Promotion.",
  1050: "A decision placed on top of a result; the marks are left as they are.",
  // Fees
  155: "What each class pays, per fee type. Fees are raised from this.",
  157: "For a child who pays something different from their class.",
  158: "Take a payment at the counter and print the receipt.",
  161: "Everything one child has been charged and has paid.",
  162: "Who still owes, and how much.",
  1040: "The types a charge falls under, such as tuition, bus or exam.",
  1041: "Raise a month's recurring charges for a class or the whole school.",
  1042: "Waive or change one child's charge, with a reason.",
  1043: "Keys and settings for taking payments online.",
  1044: "Online payments that never reached a fee row, and overpayments.",
  1045: "Cheques taken, and what became of them.",
  163: "Standing discounts, such as sibling, staff ward or merit.",
  164: "What to charge when a fee is paid after the due date.",
  170: "Money in and out, day by day.",
  // Transport, library, hostel
  193: "Which child boards which bus, and at which stop.",
  196: "Who got on and off the bus.",
  205: "Charge for a book returned late, lost or damaged.",
  1073: "Loan limits, loan days and the fine rate.",
  214: "The hostel mess menu for the week, and the day-school canteen menu.",
  // Health and discipline
  220: "Vaccinations given, and allergies to watch for.",
  225: "Who to ring first for a child, and in what order.",
  // Security, stock
  231: "Let a child leave early with a gate pass.",
  240: "Which asset is out, and with whom.",
  244: "Book a lab for a practical.",
  // Communication
  249: "Trip details, and which parents have agreed.",
  250: "Arrange a parent-teacher meeting and its slots.",
  254: "Write a message and send it now, or schedule it.",
  255: "What went out, to whom and when.",
  1026: "Questions parents sent from the app, and the office's replies.",
  1027: "Feedback surveys for parents; they answer in the app.",
  // Documents
  259: "Upload a paper and mark it checked.",
  262: "Issue a leaving certificate. The server refuses while fees are pending.",
  263: "Every certificate issued, with its reprints and cancellations.",
  // Reports and settings
  278: "Counts of the work each teacher has done. Not a ranking.",
  283: "Pick a source, filters and columns, and download the rows.",
  287: "Every role against every permission, side by side.",
  288: "Extra roles given to people, over and above the one they sign in with.",
  294: "Who changed what, and when.",
  295: "Bring records in from a file, or take them out.",
  1080: "Requests the office files for the principal to decide.",
};

/** Menu entries that go first in their module (the rest keep catalogue order). */
export const MENU_FIRST = new Set([289]);

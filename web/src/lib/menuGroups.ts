// Screens that share one menu entry and switch with a row of tabs on the page.
// The menu lists only the group's first screen, under the group's name; the
// others stay out of the menu (ModuleGroup) and appear as tabs (AppShell).

export type TabGroup = { label: string; tabs: [number, string][] };

export const TAB_GROUPS: TabGroup[] = [
  // Admissions
  { label: "Enquiries", tabs: [[44, "Enquiries"], [47, "Follow-ups"], [1002, "Campaigns"], [1001, "Online link"]] },
  { label: "Applications", tabs: [[48, "Applications"], [51, "Documents"], [52, "Assessment"], [53, "Approval"], [54, "Confirmation"]] },
  // Students and their families
  { label: "Students", tabs: [[55, "Directory"], [1010, "Bulk import"], [1011, "Logins"], [1012, "Enrolment history"], [69, "Promotion"], [70, "Exit & alumni"]] },
  { label: "Parents", tabs: [[71, "Directory"], [75, "Preferences"], [77, "Interactions"], [78, "Payments"]] },
  // Staff
  { label: "Staff", tabs: [[80, "Directory"], [1085, "Departments"], [84, "Teacher allocation"], [85, "Subjects & classes"], [86, "Workload"], [87, "Qualifications"], [90, "Observation"], [91, "Exit"]] },
  { label: "Recruitment", tabs: [[172, "Requisitions"], [173, "Job openings"], [174, "Candidates"], [1060, "Candidate pool"], [176, "Interviews"], [177, "Offers"], [178, "Onboarding"]] },
  { label: "Staff attendance & leave", tabs: [[179, "Attendance"], [88, "Attendance summary"], [180, "Leave policies"], [181, "Leave requests"], [182, "Leave approval"], [1061, "Balances"], [89, "Leave summary"]] },
  { label: "Payroll", tabs: [[183, "Setup"], [184, "Processing"], [185, "Payslips"], [1062, "Salary history"]] },
  { label: "My records", tabs: [[1090, "My attendance"], [1091, "My leave"], [1092, "My payslips"]] },
  // Academics
  { label: "School structure", tabs: [[92, "Academic years"], [93, "Terms"], [94, "Classes"], [95, "Sections"], [96, "Subjects"], [97, "Subject groups"], [107, "Rooms"], [1020, "Holidays"]] },
  { label: "Curriculum", tabs: [[98, "Curriculum"], [100, "Units & topics"], [101, "Learning outcomes"], [102, "Lesson plans"], [104, "Plan review"], [105, "Syllabus progress"], [106, "Resources"]] },
  // Attendance
  { label: "Registers", tabs: [[111, "Period attendance"], [112, "Register"], [113, "Corrections"], [1030, "Lock & reopen"], [1031, "Gaps"], [116, "Late & early exit"]] },
  { label: "Attendance reports", tabs: [[117, "Monthly summary"], [118, "Chronic absence"], [119, "Reports"]] },
  // Timetable
  { label: "Timetable", tabs: [[121, "Setup"], [122, "Periods"], [123, "Teacher availability"], [124, "Generate"], [125, "Class timetable"], [126, "Teacher timetable"]] },
  // Examinations
  { label: "Exam setup", tabs: [[139, "Exam types"], [140, "Exams"], [141, "Schedule"], [142, "Halls"], [143, "Invigilation"], [144, "Admit cards"]] },
  { label: "Marks", tabs: [[146, "Practical marks"], [148, "Verification"], [1050, "Overrides"], [149, "Grading scale"]] },
  { label: "Results", tabs: [[150, "Publish"], [151, "Student result"], [152, "Report card"], [1051, "Printing"], [153, "Promotion decision"]] },
  { label: "Online tests", tabs: [[1023, "Tests"], [1022, "Question bank"], [1024, "Results"]] },
  // Fees and finance
  { label: "Fee setup", tabs: [[155, "Fee structure"], [1040, "Fee heads"], [157, "Assignment"], [1041, "Generate fees"], [163, "Concessions"], [164, "Fine rules"], [1042, "Waivers"], [1043, "Payment gateway"]] },
  { label: "Collections", tabs: [[158, "Collect fees"], [160, "Receipts"], [159, "Online payments"], [1044, "Reconciliation"], [1045, "Cheques"], [161, "Student ledger"], [162, "Outstanding dues"], [165, "Refunds"]] },
  { label: "Accounts", tabs: [[166, "Income"], [167, "Expenses"], [1046, "Expense categories"], [168, "Vendors"], [169, "Purchases"], [1047, "Purchase orders"], [170, "Cash & bank"]] },
  // Transport
  { label: "Fleet", tabs: [[186, "Vehicles"], [192, "Drivers & conductors"], [197, "Maintenance & fuel"]] },
  { label: "Routes", tabs: [[189, "Routes"], [191, "Stops"], [193, "Student assignment"]] },
  { label: "Daily transport", tabs: [[194, "Trip sheets"], [196, "Boarding"], [195, "Live tracking"]] },
  // Library
  { label: "Catalogue", tabs: [[198, "Books"], [206, "Digital library"], [201, "Members"], [1073, "Settings"]] },
  { label: "Circulation", tabs: [[202, "Issue"], [203, "Return"], [204, "Renew & reserve"], [205, "Fines & lost books"]] },
  // Communication
  { label: "Messages", tabs: [[252, "Announcements"], [253, "Inbox"], [254, "Campaigns"], [255, "History"], [296, "Notifications"]] },
  { label: "Events & PTM", tabs: [[246, "Calendar"], [249, "Field trips"], [250, "PTM setup"], [251, "PTM slots"]] },
  { label: "Parent desk", tabs: [[1026, "Help desk"], [1027, "Surveys"]] },
  // Reports
  { label: "School reports", tabs: [[265, "Admissions"], [266, "Strength"], [267, "Demographics"], [268, "Attendance"], [269, "Chronic absence"], [270, "Academic"], [271, "Subjects"], [272, "Exam results"], [278, "Teachers"]] },
  { label: "Finance & operations reports", tabs: [[273, "Fee collection"], [274, "Outstanding dues"], [275, "Finance summary"], [277, "Payroll"], [276, "Staff attendance"], [279, "Transport"], [280, "Library"], [281, "Inventory"], [282, "Communication"]] },
  // Hostel
  { label: "Hostel setup", tabs: [[208, "Hostels"], [209, "Rooms & beds"], [211, "Wardens"]] },
  { label: "Residents", tabs: [[210, "Allocation"], [212, "Attendance"], [213, "Leave & outings"], [215, "Complaints & fees"]] },
  // Health and wellbeing
  { label: "Clinic", tabs: [[218, "Clinic visits"], [217, "Medical profiles"], [219, "Medication"], [220, "Immunisation"], [1071, "Check-ups"], [225, "Emergency contacts"]] },
  { label: "Counselling", tabs: [[221, "Appointments"], [222, "Case notes"]] },
  { label: "Discipline", tabs: [[223, "Incidents"], [224, "Follow-up"], [1094, "Behaviour notes"]] },
  // Campus security
  { label: "Visitors", tabs: [[227, "Check-in"], [228, "Approval"], [229, "Passes"], [230, "Check-out"], [1070, "Directory"]] },
  { label: "Gate", tabs: [[231, "Early pickup"], [232, "Gate log"], [233, "Incidents"]] },
  // Inventory and labs
  { label: "Stock", tabs: [[235, "Items"], [236, "Stock in"], [237, "Issue & return"], [238, "Suppliers"], [1048, "Store sales"]] },
  { label: "Assets", tabs: [[239, "Register"], [240, "Assignment"], [241, "Maintenance"]] },
  { label: "Labs", tabs: [[242, "Labs"], [243, "Equipment"], [244, "Bookings"]] },
  // Documents and certificates
  { label: "Documents", tabs: [[256, "Repository"], [257, "Student documents"], [258, "Staff documents"], [259, "Upload & verify"]] },
  { label: "Certificates", tabs: [[261, "Generate"], [260, "Templates"], [262, "Transfer certificate"], [263, "Register"]] },

  {
    label: "Users & roles",
    tabs: [[284, "Users"], [285, "Roles"], [286, "Permissions"], [287, "Permission matrix"], [288, "Role assignment"]],
  },
  {
    label: "Preferences",
    tabs: [[290, "Academic"], [291, "Notifications"], [1082, "WhatsApp"], [292, "Integrations"], [293, "Security"]],
  },
  {
    label: "Data & audit",
    tabs: [[294, "Audit log"], [295, "Import / export / backup"], [1081, "Data exports"]],
  },
];

/** The group a screen belongs to, if any. */
export function tabGroupOf(n: number | undefined): TabGroup | undefined {
  return n === undefined ? undefined : TAB_GROUPS.find((g) => g.tabs.some(([t]) => t === n));
}

/** Menu names that differ from the screen's own name. */
export const MENU_LABEL: Record<number, string> = {
  44: "Enquiry",
  289: "School setup",
  ...Object.fromEntries(TAB_GROUPS.map((g) => [g.tabs[0][0], g.label])),
};

/** Menu entries that go first in their module (the rest keep catalogue order). */
export const MENU_FIRST = new Set([289]);

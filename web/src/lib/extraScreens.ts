// Screens the backend supports that the 296 mocks never drew. They live in
// the same registry so the sidebar, top bar and search treat them like the
// rest; their ids start NEW- and their numbers at 1000.
//
// Hand-maintained: scripts/build_pages.py never generates pages for these.

import type { Screen } from "./screens";

const M = {
  admissions: ["Admissions & Enquiries", "Admissions"],
  students: ["Students", "Students"],
  staff: ["Teachers & Staff", "Teachers & staff"],
  academics: ["Academics & Curriculum", "Academics"],
  attendance: ["Student Attendance", "Attendance"],
  homework: ["Homework & Assignments", "Homework"],
  exams: ["Examinations / Marks / Results", "Examinations"],
  fees: ["Fees & Finance", "Fees & finance"],
  hr: ["HR / Leave / Payroll", "Human resources"],
  transport: ["Transport / Bus / GPS", "Transport"],
  library: ["Library", "Library"],
  health: ["Health / Counselling / Discipline", "Health & wellbeing"],
  security: ["Visitor / Gate / Security", "Campus security"],
  inventory: ["Inventory / Assets / Labs", "Inventory & labs"],
  comms: ["Events / PTM / Communication", "Communication"],
  settings: ["Settings / Roles / Permissions / Audit", "Settings"],
  platform: ["Super Admin / SaaS Administration", "Platform"],
} as const;

type Def = [n: number, name: string, mod: keyof typeof M, role: string, layout: string, route: string];

const DEFS: Def[] = [
  [1001, "Online Admission Link", "admissions", "School Admin", "settings", "/admissions/online-admission-link"],
  [1002, "Admission Campaigns", "admissions", "School Admin", "table", "/admissions/admission-campaigns"],
  [1010, "Bulk Student Import", "students", "School Admin", "import", "/students/bulk-student-import"],
  [1011, "Student Logins", "students", "School Admin", "table", "/students/student-logins"],
  [1012, "Enrolment History", "students", "School Admin", "table", "/students/enrolment-history"],
  [1020, "Holidays", "academics", "School Admin", "calendar", "/academics/holidays"],
  [1021, "Rubrics", "homework", "Teacher", "table", "/homework/rubrics"],
  [1022, "Question Bank", "exams", "Teacher", "table", "/examinations/question-bank"],
  [1023, "Online Tests", "exams", "Teacher", "table", "/examinations/online-tests"],
  [1024, "Online Test Results", "exams", "Teacher", "table", "/examinations/online-test-results"],
  [1025, "Gallery & Videos", "comms", "School Admin", "table", "/communication/gallery-videos"],
  [1026, "Parent Help Desk", "comms", "School Admin", "table", "/communication/parent-help-desk"],
  [1027, "Parent Surveys", "comms", "School Admin", "table", "/communication/parent-surveys"],
  [1030, "Register Lock & Reopen", "attendance", "School Admin", "table", "/attendance/register-lock-reopen"],
  [1031, "Period Attendance Gaps", "attendance", "School Admin", "table", "/attendance/period-attendance-gaps"],
  [1040, "Fee Heads", "fees", "Accountant", "table", "/fees-finance/fee-heads"],
  [1041, "Generate Fees", "fees", "Accountant", "form", "/fees-finance/generate-fees"],
  [1042, "Fee Waivers & Adjustments", "fees", "Accountant", "table", "/fees-finance/fee-waivers-adjustments"],
  [1043, "Payment Gateway Settings", "fees", "School Admin", "settings", "/fees-finance/payment-gateway-settings"],
  [1044, "Online Payment Reconciliation", "fees", "Accountant", "table", "/fees-finance/online-payment-reconciliation"],
  [1045, "Cheques", "fees", "Accountant", "table", "/fees-finance/cheques"],
  [1046, "Expense Categories", "fees", "Accountant", "table", "/fees-finance/expense-categories"],
  [1047, "Purchase Orders & Bills", "fees", "Accountant", "table", "/fees-finance/purchase-orders-bills"],
  [1048, "School Store Sales", "inventory", "Store Keeper", "table", "/inventory-labs/school-store-sales"],
  [1050, "Result Overrides", "exams", "Principal", "table", "/examinations/result-overrides"],
  [1051, "Report Card Printing", "exams", "School Admin", "table", "/examinations/report-card-printing"],
  [1060, "Candidate Pool", "hr", "HR Manager", "table", "/human-resources/candidate-pool"],
  [1061, "Leave Balances", "hr", "HR Manager", "table", "/human-resources/leave-balances"],
  [1062, "Salary History & Bank Files", "hr", "HR Manager", "table", "/human-resources/salary-history-bank-files"],
  [1070, "Visitor Directory", "security", "Security", "table", "/campus-security/visitor-directory"],
  [1071, "Health Checkups", "health", "Nurse", "table", "/health-wellbeing/health-checkups"],
  [1072, "Transport Dashboard", "transport", "Transport Manager", "dashboard", "/transport/transport-dashboard"],
  [1073, "Library Settings", "library", "Librarian", "settings", "/library/library-settings"],
  [1080, "Approval Requests", "settings", "Principal", "approval", "/settings/approval-requests"],
  [1081, "Data Exports", "settings", "School Admin", "table", "/settings/data-exports"],
  [1082, "WhatsApp Integration", "settings", "School Admin", "settings", "/settings/whatsapp-integration"],
  // Departments: the school admin needs them for staff, job openings and subjects;
  // SCR-031 sits in the platform's school-setup module, out of their menu.
  [1085, "Departments", "staff", "School Admin", "form", "/staff/departments"],
  [1083, "Tenant Integrations", "platform", "Super Admin", "table", "/platform/tenant-integrations"],
  // Self-service portals: staff, teacher, student.
  [1090, "My Attendance", "hr", "Staff", "attendancehistory", "/human-resources/my-attendance"],
  [1091, "My Leave", "hr", "Staff", "table", "/human-resources/my-leave"],
  [1092, "My Payslips", "hr", "Staff", "table", "/human-resources/my-payslips"],
  [1093, "My Library Loans", "library", "Staff", "table", "/library/my-library-loans"],
  [1094, "Behaviour Notes", "health", "Teacher", "table", "/health-wellbeing/behaviour-notes"],
  [1095, "Weekly Progress Reports", "academics", "Teacher", "table", "/academics/weekly-progress-reports"],
  [1096, "My Students", "students", "Teacher", "table", "/students/my-students"],
  [1097, "My Profile", "staff", "Staff", "form", "/staff/my-profile"],
];

export const EXTRA_SCREENS: Screen[] = DEFS.map(([n, name, mod, role, layout, route]) => ({
  id: `NEW-${String(n).slice(1)}`,
  n,
  name,
  module: M[mod][0],
  moduleShort: M[mod][1],
  role,
  release: "Extension",
  layout,
  stories: [],
  route,
}));

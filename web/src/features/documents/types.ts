// Shapes returned by /api/v1/school/documents and /api/v1/school/certificates.

export type OwnerType = "student" | "staff" | "school";
export type Verification = "pending" | "verified" | "rejected";

export type Doc = {
  id: number;
  owner_type: OwnerType;
  owner_id: number | null;
  owner_name: string | null;
  category: string;
  title: string;
  content_type: string;
  size_bytes: number;
  original_name: string;
  expires_on: string | null;
  visible_to_parent: boolean;
  uploaded_by_name: string | null;
  uploaded_by_parent: boolean;
  verification_status: Verification;
  verified_by_name: string | null;
  verified_at: string | null;
  remarks: string | null;
  created_at: string;
};

export type DocSummary = { pending_verification: number; expiring_soon: number; by_owner: Record<string, number> };

/** DocumentCategory in the API, in its order. */
export const DOCUMENT_CATEGORIES = [
  "birth_certificate",
  "aadhaar",
  "photo",
  "address_proof",
  "transfer_certificate",
  "previous_marksheet",
  "medical",
  "caste_certificate",
  "qualification",
  "experience",
  "id_proof",
  "policy",
  "circular",
  "other",
];

/** What a child's file holds (the old frontend's student list). */
export const STUDENT_CATEGORIES = ["birth_certificate", "aadhaar", "photo", "address_proof", "transfer_certificate", "previous_marksheet", "medical", "caste_certificate", "other"];

/** What a staff file holds. */
export const STAFF_CATEGORIES = ["qualification", "experience", "id_proof", "aadhaar", "photo", "medical", "other"];

/** School-wide papers. */
export const SCHOOL_CATEGORIES = ["policy", "circular", "other"];

export type CertKind = "bonafide" | "character" | "transfer" | "study" | "fee_paid" | "custom";
export const CERT_KINDS: CertKind[] = ["bonafide", "study", "character", "transfer", "fee_paid", "custom"];
export type CertStatus = "requested" | "issued" | "rejected" | "cancelled";

export type Template = {
  id: number;
  kind: CertKind;
  name: string;
  title: string;
  body: string;
  serial_prefix: string;
  parent_can_request: boolean;
  is_active: boolean;
};

export type Certificate = {
  id: number;
  kind: CertKind;
  template_id: number | null;
  template_name: string | null;
  student_id: number;
  student_name: string;
  admission_no: string;
  section_label: string | null;
  status: CertStatus;
  purpose: string | null;
  signatory?: string | null;
  fields: Record<string, unknown>;
  serial_no: string | null;
  title: string | null;
  rendered_body: string | null;
  issued_on: string | null;
  issued_by_name: string | null;
  requested_by_name: string | null;
  remarks: string | null;
  print_count: number;
  created_at: string;
};

export type Preview = { title?: string; body: string; missing: string[] };

/** TCFields in the API. */
export type TcFields = {
  date_of_leaving: string;
  reason_for_leaving: string;
  last_class_studied: string | null;
  promoted_to: string | null;
  conduct: string;
  fees_paid_up_to: string | null;
  remarks: string | null;
  deactivate_student: boolean;
  allow_with_dues: boolean;
};

export type SchoolProfile = { id: number; name: string; address: string | null; principal_name: string | null };

export type StaffRow = { id: number; full_name: string; designation: string | null; is_active: boolean };

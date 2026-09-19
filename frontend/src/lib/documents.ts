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

/** Categories a parent may upload for their child. */
export const PARENT_UPLOAD_CATEGORIES = [
  "birth_certificate",
  "aadhaar",
  "photo",
  "address_proof",
  "transfer_certificate",
  "previous_marksheet",
  "medical",
  "caste_certificate",
  "other",
];

export function fileSize(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
}

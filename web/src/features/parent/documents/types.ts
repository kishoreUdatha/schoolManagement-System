/** A certificate request or issued certificate (GET …/certificates). */
export type Certificate = {
  id: number;
  kind: string;
  template_id: number | null;
  template_name: string | null;
  status: "requested" | "issued" | "rejected" | "cancelled";
  purpose: string | null;
  serial_no: string | null;
  issued_on: string | null;
  remarks: string | null;
  created_at: string;
};

/** A certificate the parent may ask for (GET …/certificates/available). */
export type CertificateTemplate = {
  id: number;
  kind: string;
  name: string;
  parent_can_request: boolean;
  is_active: boolean;
};

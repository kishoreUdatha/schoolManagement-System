// Where the school's public pages live, and what their API returns.
// Shared by the public pages and the admin screen that hands the links out.

export const applyPath = (tenant: string, school: string) => `/apply/${encodeURIComponent(tenant)}/${encodeURIComponent(school)}`;
export const careersPath = (tenant: string, school: string) => `/careers/${encodeURIComponent(tenant)}/${encodeURIComponent(school)}`;

/** GET /api/v1/public/admissions/{tenant}/{school} and /public/careers/{tenant}/{school}. */
export type PublicSchoolInfo = {
  school_name: string;
  logo_url: string | null;
  brand_color: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

/** GET /api/v1/public/careers/{tenant}/{school}/openings. */
export type PublicOpening = {
  id: number;
  reference_no: string;
  title: string;
  department_name: string | null;
  employment_type: "full_time" | "part_time" | "contract" | "temporary";
  vacancies: number;
  description: string | null;
  requirements: string | null;
  closes_on: string | null;
};

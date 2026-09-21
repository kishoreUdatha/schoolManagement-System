import { Suspense } from "react";
import { Gallery } from "./Gallery";

export const metadata = { title: "BrightCampus · 296 School ERP Screens" };

export default function Page() {
  return (
    <Suspense>
      <Gallery />
    </Suspense>
  );
}

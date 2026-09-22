// Parent app screens the Parent Mobile pack does not have, for backend
// features parents can use: online tests and the school photo gallery.
// Numbered from 101 so they never collide with the pack's PM-001…PM-058.
// Hand-maintained; parentScreens.ts (generated) appends them.

import type { ParentScreen } from "./parentScreens";

export const PARENT_EXTRA_SCREENS: ParentScreen[] = [
  {"id": "PM-101", "n": 101, "title": "Online tests", "module": "Learning", "release": "Phase 2", "feature": "See the child's online tests, start or resume one, and read results the school has released.", "erp": ["NEW-023"], "route": "/parent/online-tests", "tab": "learn", "global": false, "public": false},
  {"id": "PM-102", "n": 102, "title": "Online test", "module": "Learning", "release": "Phase 2", "feature": "Take an online test with the child: answers save as they go, and it submits on time.", "erp": ["NEW-023"], "route": "/parent/online-test", "tab": "learn", "global": false, "public": false},
  {"id": "PM-103", "n": 103, "title": "Photo gallery", "module": "Events & activities", "release": "Phase 2", "feature": "Browse the photo albums the school shares with parents.", "erp": ["NEW-025"], "route": "/parent/photo-gallery", "tab": "more", "global": true, "public": false},
];

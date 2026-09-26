"""Pages about one record (?id=): which record of the test school opens them."""
RECORD = {
    "SCR-012": "tenant", "SCR-027": "branch", "SCR-046": "enquiry",
    **{f"SCR-0{n}": "student" for n in range(57, 69)},
    "SCR-073": "parent", "SCR-074": "parent", "SCR-076": "parent", "SCR-079": "parent",
    "SCR-082": "staff", "SCR-083": "staff", "SCR-099": "class_subject", "SCR-130": "homework", "SCR-248": "event",
}

import { longDate } from "./dates";

export const TEMPLATES_DIR = "Templates";
export const isTemplatePath = (p: string) => p.startsWith(TEMPLATES_DIR + "/");
export const DAILY_TEMPLATE = `${TEMPLATES_DIR}/Daily note.md`;

export const STARTERS: Record<string, string> = {
  [DAILY_TEMPLATE]: "# {{long_date}}\n\n## Plan\n\n## Notes\n\n## Done\n",
  [`${TEMPLATES_DIR}/Game idea.md`]: "# {{title}}\n\n## Pitch\n\n## Mechanics\n\n## Risks\n\n## Next\n- [ ] Sketch the first prototype\n",
  [`${TEMPLATES_DIR}/Meeting.md`]: "# {{title}}\n\n{{long_date}}\n\n## Agenda\n\n## Notes\n\n## Actions\n",
};

/** Placeholders: {{title}} {{date}} (2026-10-29) {{long_date}} (Thursday, 29 October) */
export function fillTemplate(tpl: string, vars: { title?: string; date: string }): string {
  return tpl
    .replace(/\{\{title\}\}/g, vars.title ?? "")
    .replace(/\{\{date\}\}/g, vars.date)
    .replace(/\{\{long_date\}\}/g, longDate(vars.date));
}

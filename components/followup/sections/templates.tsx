import { updateTemplate } from '@/app/actions'
import { getTemplates } from '@/lib/data'
import type { HomeContext } from '@/lib/types'
import { ActionForm } from '../action-form'
import { Field, inputClass } from '../field'

export async function TemplatesSection({ ctx }: { ctx: HomeContext }) {
  const templates = await getTemplates(ctx.home.id)
  const isAdmin = ctx.role === 'admin'

  return (
    <div className="flex flex-col gap-5">
      <p className="rounded-lg bg-notice p-4 text-sm leading-relaxed text-notice-foreground">
        Placeholders: {'{first_name}'}, {'{deceased_name}'}, {'{funeral_home}'}.{' '}
        {isAdmin ? 'Changes apply to newly scheduled messages.' : 'Only administrators can edit templates.'}
      </p>
      <ol className="flex flex-col gap-3">
        {templates.map((template) => (
          <li key={template.id} className="rounded-xl bg-card p-5">
            <p className="text-xs tracking-wider text-muted-foreground">MESSAGE {template.position} OF 5</p>
            {isAdmin ? (
              <ActionForm action={updateTemplate} submitLabel="Save template" className="mt-3">
                <input type="hidden" name="id" value={template.id} />
                <div className="grid gap-4 md:grid-cols-[1fr_12rem]">
                  <Field label="Title" htmlFor={`title-${template.id}`}>
                    <input id={`title-${template.id}`} name="title" required maxLength={80} defaultValue={template.title} className={inputClass} />
                  </Field>
                  <Field label="Days after service" htmlFor={`offset-${template.id}`}>
                    <input
                      id={`offset-${template.id}`}
                      name="offsetDays"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={730}
                      required
                      defaultValue={template.offset_days}
                      className={inputClass}
                    />
                  </Field>
                </div>
                <Field label="Message" htmlFor={`tbody-${template.id}`}>
                  <textarea id={`tbody-${template.id}`} name="body" rows={4} maxLength={640} required defaultValue={template.body} className={inputClass} />
                </Field>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" name="isActive" defaultChecked={template.is_active} className="size-5 accent-brand" />
                  Include when scheduling follow-ups
                </label>
              </ActionForm>
            ) : (
              <>
                <p className="mt-2 font-semibold">
                  {template.title} · {template.offset_days} days after service
                  {template.is_active ? '' : ' · Off'}
                </p>
                <p className="mt-2 leading-relaxed text-muted-foreground">{template.body}</p>
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

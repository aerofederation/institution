'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Plus } from 'lucide-react'
import { toast } from 'sonner'

import { DateTimePicker } from '@/components/shared/date-time-picker'
import { Field } from '@/components/institution/teacher-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { PublishTargets } from '@/services/teacher/overview'
import { createAssessment } from '@/services/teaching/assessments'
import { createClient } from '@/lib/supabase/client'
import {
  attachMaterialFile,
  createMaterial,
  requestMaterialUpload,
  setMaterialPublished,
} from '@/services/teaching/materials'

const SELECT_CLASS =
  'border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none'

/**
 * The class a piece of content is addressed to.
 *
 * One control, not three. A class, its section and its academic year always
 * travel together — they come from a single teaching assignment — so offering
 * them separately would let a teacher build a combination the composite foreign
 * keys then refuse. The three ids are carried in hidden inputs, set from the
 * chosen assignment.
 */
function DeliverySelect({
  targets,
  error,
}: {
  targets: PublishTargets['targets']
  error?: string
}) {
  type Target = PublishTargets['targets'][number]
  const [chosen, setChosen] = useState<Target | null>(targets[0] ?? null)

  return (
    <>
      <Field label="Class" name="target" error={error} required>
        <select
          id="target"
          className={SELECT_CLASS}
          value={chosen ? `${chosen.class_id}:${chosen.section_id ?? ''}` : ''}
          onChange={(event) => {
            const [classId, sectionId] = event.target.value.split(':')
            setChosen(
              targets.find(
                (target) =>
                  target.class_id === classId && (target.section_id ?? '') === sectionId,
              ) ?? null,
            )
          }}
          required
        >
          {targets.map((target) => (
            <option
              key={`${target.class_id}:${target.section_id ?? ''}`}
              value={`${target.class_id}:${target.section_id ?? ''}`}
            >
              {target.label}
            </option>
          ))}
        </select>
      </Field>

      <input type="hidden" name="class_id" value={chosen?.class_id ?? ''} />
      <input type="hidden" name="section_id" value={chosen?.section_id ?? ''} />
      <input type="hidden" name="academic_year_id" value={chosen?.academic_year_id ?? ''} />
    </>
  )
}

function SubjectSelect({
  subjects,
  error,
}: {
  subjects: PublishTargets['subjects']
  error?: string
}) {
  if (subjects.length === 0) return null

  return (
    <Field label="Subject" name="subject_id" error={error}>
      <select id="subject_id" name="subject_id" defaultValue="" className={SELECT_CLASS}>
        <option value="">Not set</option>
        {subjects.map((subject) => (
          <option key={subject.id} value={subject.id}>
            {subject.name}
          </option>
        ))}
      </select>
    </Field>
  )
}

/** Shared dialog plumbing: open state, pending state, field errors, toast. */
function ContentDialog({
  trigger,
  title,
  description,
  submitLabel,
  action,
  successMessage,
  afterCreate,
  children,
  disabled,
}: {
  trigger: React.ReactNode
  title: string
  description: string
  submitLabel: string
  action: (input: unknown) => Promise<
    { ok: true; data: unknown } | { ok: false; message: string; fieldErrors?: Record<string, string[]> }
  >
  /**
   * Work that can only happen once the record exists — uploading a file against
   * its id, for one. Returning a message keeps the dialog open and reports it,
   * so a failed upload does not look like a failed save when the record was in
   * fact created.
   */
  afterCreate?: (data: unknown) => Promise<string | null>
  successMessage: string
  children: (helpers: { error: (name: string) => string | undefined }) => React.ReactNode
  disabled?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const submit = (formData: FormData) => {
    setErrors({})

    startTransition(async () => {
      const result = await action(Object.fromEntries(formData.entries()))

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }

      if (afterCreate) {
        const failure = await afterCreate(result.data)
        if (failure) {
          // The record was saved; only the follow-up failed. Saying so stops a
          // teacher pressing Save again and creating a duplicate.
          toast.error(failure)
          router.refresh()
          return
        }
      }

      toast.success(successMessage)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild disabled={disabled}>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form action={submit} className="flex flex-col gap-4">
          {children({ error: (name) => errors[name]?.[0] })}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/*
 * Props are forwarded so `DialogTrigger asChild` can merge its click handler
 * onto the button. A wrapper that swallows them renders a button that does
 * nothing at all — which is easy to miss, because it looks entirely correct.
 */
function AddButton({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof Button>) {
  return (
    <Button size="sm" {...props}>
      <Plus className="size-4" aria-hidden="true" />
      {label}
    </Button>
  )
}

export function MaterialForm({ options }: { options: PublishTargets }) {
  const [materialType, setMaterialType] = useState('DOCUMENT')
  const [file, setFile] = useState<File | null>(null)
  const [wantsPublish, setWantsPublish] = useState(false)
  const none = options.targets.length === 0

  /*
   * A file cannot be uploaded until the material exists, because the storage
   * path is keyed by the material's id. So the save happens first and the
   * upload follows, against the row that was just created.
   *
   * When a file is chosen the material is created as a draft whatever the
   * publish box says, and published only after the file is safely attached.
   * Publishing first would put a document in front of the class in the window
   * before the bytes arrive — and leave it there permanently if they never do.
   */
  const uploadAfterCreate = async (data: unknown) => {
    const created = data as { id: string; published: boolean }
    if (!file) return null

    const ticket = await requestMaterialUpload({
      material_id: created.id,
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      file_size: file.size,
    })
    if (!ticket.ok) return `Saved, but the upload could not start: ${ticket.message}`

    const upload = await createClient()
      .storage.from('learning-materials')
      .uploadToSignedUrl(ticket.data.path, ticket.data.token, file, {
        contentType: file.type || undefined,
      })
    if (upload.error) {
      return `Saved as a draft, but the file did not upload: ${upload.error.message}. Attach it from the list.`
    }

    const attached = await attachMaterialFile({
      material_id: created.id,
      storage_path: ticket.data.path,
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      file_size: file.size,
    })
    if (!attached.ok) return `The file uploaded but was not recorded: ${attached.message}`

    if (wantsPublish) {
      const published = await setMaterialPublished({ material_id: created.id, publish: true })
      if (!published.ok) {
        return `The file is attached, but publishing failed: ${published.message}`
      }
    }

    setFile(null)
    return null
  }

  return (
    <ContentDialog
      trigger={<AddButton label="Add material" disabled={none} />}
      title="Publish study material"
      description="A file, a link, or a note written here. Students in the class see it once you publish."
      submitLabel="Save material"
      action={createMaterial}
      afterCreate={uploadAfterCreate}
      successMessage={file ? 'Material saved and file uploaded' : 'Material saved'}
      disabled={none}
    >
      {({ error }) => (
        <>
          <DeliverySelect targets={options.targets} error={error('class_id')} />

          <Field label="Title" name="title" error={error('title')} required>
            <Input id="title" name="title" required />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" name="material_type" error={error('material_type')} required>
              <select
                id="material_type"
                name="material_type"
                value={materialType}
                onChange={(event) => setMaterialType(event.target.value)}
                className={SELECT_CLASS}
              >
                <option value="DOCUMENT">File upload</option>
                <option value="LINK">External link</option>
                <option value="NOTE">Written note</option>
              </select>
            </Field>

            <SubjectSelect subjects={options.subjects} error={error('subject_id')} />
          </div>

          {materialType === 'LINK' ? (
            <Field label="Link" name="external_url" error={error('external_url')} required>
              <Input id="external_url" name="external_url" placeholder="https://…" />
            </Field>
          ) : null}

          {materialType === 'DOCUMENT' ? (
            <Field
              label="File"
              name="file"
              error={error('file')}
              hint="PDF, slides, a worksheet, an image. Up to 200 MB."
            >
              <Input
                id="file"
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="file:text-foreground file:mr-3 file:cursor-pointer file:border-0 file:bg-transparent file:text-sm file:font-medium"
              />
            </Field>
          ) : null}

          <Field
            label={materialType === 'NOTE' ? 'Note' : 'Description'}
            name="description"
            error={error('description')}
            required={materialType === 'NOTE'}
          >
            <Textarea id="description" name="description" rows={materialType === 'NOTE' ? 6 : 3} />
          </Field>

          <label className="flex items-center gap-2.5 text-sm">
            {/*
              With a file chosen this carries no `name`, so it is not submitted
              and the material is created as a draft. It is published in
              `uploadAfterCreate`, after the file is attached — otherwise the
              class would see a document with nothing behind it.
            */}
            <Checkbox
              name={file ? undefined : 'is_published'}
              value="true"
              checked={wantsPublish}
              onCheckedChange={(next) => setWantsPublish(next === true)}
            />
            Publish to the class now
          </label>
        </>
      )}
    </ContentDialog>
  )
}

export function AssessmentForm({ options }: { options: PublishTargets }) {
  const none = options.targets.length === 0

  return (
    <ContentDialog
      trigger={<AddButton label="New quiz or test" disabled={none} />}
      title="Create a quiz or test"
      description="Add the questions next. It stays a draft until you publish it."
      submitLabel="Create"
      action={createAssessment}
      successMessage="Created — now add questions"
      disabled={none}
    >
      {({ error }) => (
        <>
          <DeliverySelect targets={options.targets} error={error('class_id')} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" name="kind" error={error('kind')} required>
              <select id="kind" name="kind" defaultValue="QUIZ" className={SELECT_CLASS}>
                <option value="QUIZ">Quiz</option>
                <option value="TEST">Test</option>
              </select>
            </Field>

            <SubjectSelect subjects={options.subjects} error={error('subject_id')} />
          </div>

          <Field label="Title" name="title" error={error('title')} required>
            <Input id="title" name="title" required />
          </Field>

          <Field label="Instructions" name="instructions" error={error('instructions')}>
            <Textarea id="instructions" name="instructions" rows={3} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Time limit (minutes)"
              name="duration_minutes"
              error={error('duration_minutes')}
              hint="Leave blank for no limit"
            >
              <Input id="duration_minutes" name="duration_minutes" type="number" min={1} max={600} />
            </Field>

            <Field label="Attempts allowed" name="max_attempts" error={error('max_attempts')} required>
              <Input
                id="max_attempts"
                name="max_attempts"
                type="number"
                min={1}
                max={10}
                defaultValue={1}
                required
              />
            </Field>

            <Field label="Pass mark" name="pass_marks" error={error('pass_marks')}>
              <Input id="pass_marks" name="pass_marks" type="number" min={0} max={1000} />
            </Field>

            <Field label="Opens" name="opens_at" error={error('opens_at')}>
              <DateTimePicker id="opens_at" name="opens_at" defaultTime="09:00" />
            </Field>

            <Field label="Closes" name="closes_at" error={error('closes_at')}>
              <DateTimePicker id="closes_at" name="closes_at" defaultTime="23:59" />
            </Field>
          </div>

          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox name="shuffle_questions" value="true" />
            Shuffle the question order
          </label>

          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox name="reveal_answers" value="true" defaultChecked />
            Show students which answers were right after they submit
          </label>
        </>
      )}
    </ContentDialog>
  )
}

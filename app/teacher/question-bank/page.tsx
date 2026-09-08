import Link from 'next/link'

import { Library } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { BankItemActions } from '@/components/teacher/bank-item-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { humaniseEnum } from '@/lib/constants/enums'
import { QUESTION_TYPES } from '@/lib/validation/assessment'
import { listBankItems } from '@/services/assessments/bank'
import { getPublishTargets } from '@/services/teacher/overview'

export const metadata = { title: 'Question bank' }

const SELECT_CLASS =
  'border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none'

/**
 * A teacher's own reusable questions.
 *
 * Filtering and paging happen in the database — a teacher with two thousand
 * questions should not ship two thousand rows to a browser to find four. The
 * form below is a plain GET, so every filtered view is a real URL that can be
 * bookmarked, shared and reloaded.
 */
export default async function QuestionBankPage({
  searchParams,
}: PageProps<'/teacher/question-bank'>) {
  const params = await searchParams
  const read = (key: string) => (typeof params[key] === 'string' ? params[key] : undefined)

  const [{ rows, total, page, pageSize }, options] = await Promise.all([
    listBankItems({
      q: read('q'),
      subject_id: read('subject_id'),
      question_type: read('question_type'),
      difficulty: read('difficulty'),
      topic: read('topic'),
      page: read('page') ?? 1,
    }),
    getPublishTargets(),
  ])

  const pages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Question bank"
        description="Your own reusable questions. Adding one to a paper copies it — editing it here never changes a paper students have already sat."
        breadcrumbs={[{ label: 'Teaching', href: '/teacher' }, { label: 'Question bank' }]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/teacher/assessments">Back to assessments</Link>
          </Button>
        }
      />

      <form className="bg-card flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <label htmlFor="q" className="text-xs font-medium">
            Search
          </label>
          <Input id="q" name="q" defaultValue={read('q') ?? ''} placeholder="Question text" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="question_type" className="text-xs font-medium">
            Type
          </label>
          <select
            id="question_type"
            name="question_type"
            defaultValue={read('question_type') ?? ''}
            className={SELECT_CLASS}
          >
            <option value="">Any type</option>
            {QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {humaniseEnum(type)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="difficulty" className="text-xs font-medium">
            Difficulty
          </label>
          <select
            id="difficulty"
            name="difficulty"
            defaultValue={read('difficulty') ?? ''}
            className={SELECT_CLASS}
          >
            <option value="">Any</option>
            <option value="EASY">Easy</option>
            <option value="MODERATE">Moderate</option>
            <option value="HARD">Hard</option>
          </select>
        </div>

        {options.subjects.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="subject_id" className="text-xs font-medium">
              Subject
            </label>
            <select
              id="subject_id"
              name="subject_id"
              defaultValue={read('subject_id') ?? ''}
              className={SELECT_CLASS}
            >
              <option value="">Any subject</option>
              {options.subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="topic" className="text-xs font-medium">
            Topic
          </label>
          <Input id="topic" name="topic" defaultValue={read('topic') ?? ''} />
        </div>

        <Button type="submit" size="sm">
          Filter
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={Library}
          title={total === 0 ? 'Your bank is empty' : 'Nothing matches those filters'}
          description={
            total === 0
              ? 'Tick "Also save to my question bank" when you write a question, and it will appear here ready to reuse.'
              : 'Try a broader search.'
          }
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/teacher/assessments">Go to assessments</Link>
            </Button>
          }
        />
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            {total} question{total === 1 ? '' : 's'}
          </p>

          <ul className="flex flex-col gap-3">
            {rows.map((item) => (
              <li key={item.id} className="bg-card flex flex-col gap-3 rounded-lg border p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="bg-muted shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase">
                    {humaniseEnum(item.question_type)}
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-medium">{item.prompt}</span>
                    <span className="text-muted-foreground text-xs">
                      {item.marks} mark{Number(item.marks) === 1 ? '' : 's'}
                      {item.difficulty ? ` · ${humaniseEnum(item.difficulty)}` : ''}
                      {item.topic ? ` · ${item.topic}` : ''}
                      {item.subjects?.name ? ` · ${item.subjects.name}` : ''}
                      {item.times_used > 0
                        ? ` · used ${item.times_used} time${item.times_used === 1 ? '' : 's'}`
                        : ' · never used'}
                    </span>
                  </div>

                  <BankItemActions itemId={item.id} prompt={item.prompt} />
                </div>

                {item.question_bank_options.length > 0 ? (
                  <ul className="text-muted-foreground flex flex-wrap gap-2 text-xs">
                    {[...item.question_bank_options]
                      .sort((a, b) => a.position - b.position)
                      .map((option) => (
                        <li
                          key={option.id}
                          className={`rounded border px-2 py-0.5 ${
                            option.is_correct ? 'border-success/40 text-success' : ''
                          }`}
                        >
                          {option.label}
                        </li>
                      ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>

          {pages > 1 ? (
            <nav aria-label="Pages" className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground text-sm">
                Page {page} of {pages}
              </span>
              <span className="flex gap-2">
                {page > 1 ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/teacher/question-bank?page=${page - 1}`}>Previous</Link>
                  </Button>
                ) : null}
                {page < pages ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/teacher/question-bank?page=${page + 1}`}>Next</Link>
                  </Button>
                ) : null}
              </span>
            </nav>
          ) : null}
        </>
      )}
    </div>
  )
}

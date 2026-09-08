'use client'

import { useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Archive, Copy, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { archiveBankItem, duplicateBankItem } from '@/services/assessments/bank'

/**
 * Duplicate or archive a bank question.
 *
 * Archive rather than delete: a paper built from this question keeps a
 * `source_bank_id` pointing at it, and deleting the row would erase where that
 * question came from. Archiving takes it out of the list and leaves the record.
 */
export function BankItemActions({ itemId, prompt }: { itemId: string; prompt: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const short = prompt.length > 40 ? `${prompt.slice(0, 40)}…` : prompt

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${short}`}>
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault()
            startTransition(async () => {
              const result = await duplicateBankItem({ item_id: itemId })
              if (!result.ok) {
                toast.error(result.message)
                return
              }
              toast.success('Duplicated')
              router.refresh()
            })
          }}
        >
          <Copy className="size-4" aria-hidden="true" />
          Duplicate
        </DropdownMenuItem>

        <DropdownMenuItem
          disabled={pending}
          variant="destructive"
          onSelect={(event) => {
            event.preventDefault()
            startTransition(async () => {
              const result = await archiveBankItem({ item_id: itemId })
              if (!result.ok) {
                toast.error(result.message)
                return
              }
              toast.success('Archived')
              router.refresh()
            })
          }}
        >
          <Archive className="size-4" aria-hidden="true" />
          Archive
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

'use client'

interface WorkoutFormProps {
  notes: string
  onNotesChange: (notes: string) => void
  onSave: () => void
  isSaving: boolean
  setsCount: number
}

export function WorkoutForm({ notes, onNotesChange, onSave, isSaving, setsCount }: WorkoutFormProps) {
  return (
    <div className="helix-card space-y-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="workout-notes" className="text-sm font-medium text-text">
          Notes <span className="text-muted-vital font-normal">(Hebrew supported)</span>
        </label>
        <textarea
          id="workout-notes"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          dir="auto"
          lang="he"
          rows={3}
          placeholder="הערות לאימון... / Workout notes..."
          maxLength={2000}
          className="bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-text
                     placeholder:text-muted-vital focus:outline-none focus:ring-2
                     focus:ring-primary/60 resize-none w-full text-sm leading-relaxed"
        />
        <p className="text-xs text-muted-vital text-right" aria-live="polite">
          {notes.length}/2000
        </p>
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={isSaving || setsCount === 0}
        aria-disabled={isSaving || setsCount === 0}
        className="btn-primary w-full py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSaving ? 'Saving…' : `Save Workout (${setsCount} set${setsCount !== 1 ? 's' : ''})`}
      </button>
      {setsCount === 0 && (
        <p className="text-xs text-muted-vital text-center">
          Log at least one set before saving.
        </p>
      )}
    </div>
  )
}

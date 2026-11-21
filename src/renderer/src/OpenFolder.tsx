import { Button } from '@/components/ui/button'

export function OpenFolder({ problem, onPick }: { problem?: string; onPick: () => void }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex w-[420px] flex-col gap-3 border border-bp-line-soft bg-bp-sheet p-5 outline outline-offset-[3px] outline-bp-line-faint">
        <h1 className="text-[11px] font-semibold tracking-[0.13em] text-bp-head uppercase">Open a Folder</h1>
        <p className="text-bp-muted">
          Blueprint works on one project Folder. Claude sessions and shells start there.
        </p>
        {problem && <p className="font-mono text-[12px] text-bp-wait">{problem}</p>}
        <Button className="self-start" onClick={onPick}>
          Open Folder
        </Button>
      </div>
    </div>
  )
}

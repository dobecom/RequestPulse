import { Info } from 'lucide-react'

interface SampleDataNoticeProps {
  kind: string
  title?: string
  description?: string
}

export function SampleDataNotice({
  kind,
  title,
  description,
}: SampleDataNoticeProps) {
  return (
    <section className="sample-data-notice" role="status">
      <Info size={18} />
      <div>
        <strong>
          {title ?? `No uploaded ${kind} logs are currently loaded.`}
        </strong>
        <span>
          {description ??
            'You are exploring three days of synthetic sample data. Upload a matching log from Home to replace this preview with your own evidence.'}
        </span>
      </div>
    </section>
  )
}

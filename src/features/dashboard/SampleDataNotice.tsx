import { Info } from 'lucide-react'

interface SampleDataNoticeProps {
  uploadGuidance: string
}

export function SampleDataNotice({ uploadGuidance }: SampleDataNoticeProps) {
  return (
    <section className="sample-data-notice" role="status">
      <Info size={18} />
      <div>
        <strong>This page is currently showing sample data.</strong>
        <span>{uploadGuidance}</span>
      </div>
    </section>
  )
}

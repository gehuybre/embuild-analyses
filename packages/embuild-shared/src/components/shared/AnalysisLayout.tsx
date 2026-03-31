import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { Badge } from '../ui/badge'
import type { ReactNode } from 'react'

type SourceInfo = {
  provider?: string
  title?: string
  url?: string
  publicationDate?: string
}

function formatDate(isoDate: string) {
  return format(parseISO(isoDate), 'd MMMM yyyy', { locale: nl })
}

export function AnalysisLayout({
  title,
  date,
  summary,
  tags,
  source,
  hideBackLink,
  children,
}: {
  title: string
  date: string
  summary?: string
  tags?: string[]
  source?: SourceInfo
  hideBackLink?: boolean
  children: ReactNode
}) {
  const showSource = Boolean(source?.provider && source?.url)

  return (
    <article className="container mx-auto py-10 max-w-3xl">
      {!hideBackLink && (
        <nav className="mb-6">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Terug naar overzicht</span>
          </a>
        </nav>
      )}

      <header className="mb-10 text-center">
        <h1 className="text-4xl font-bold mb-2">{title}</h1>
        <time dateTime={date} className="text-muted-foreground">
          {formatDate(date)}
        </time>

        {summary && <p className="mt-4 text-muted-foreground">{summary}</p>}

        {!!tags?.length && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </header>

      <div className="prose dark:prose-invert max-w-none">{children}</div>

      {showSource && (
        <footer className="mt-12 pt-6 border-t">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">Bron:</span>{' '}
            <a
              href={source!.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {source!.provider}
              {source?.title && ` - ${source.title}`}
              <ExternalLink className="h-3 w-3" />
            </a>
            {source?.publicationDate && (
              <span className="ml-2">({formatDate(source.publicationDate)})</span>
            )}
          </div>
        </footer>
      )}
    </article>
  )
}

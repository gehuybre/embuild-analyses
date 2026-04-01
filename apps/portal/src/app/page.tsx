import Link from "next/link"
import { format, parseISO } from "date-fns"
import { nl } from "date-fns/locale"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Badge } from "@embuild/shared/components/ui/badge"
import analysesData from "../../public/analyses.json"

interface Analysis {
  slug: string
  title: string
  date: string
  summary: string
  tags: string[]
  sourcePublicationDate: string
  url: string
}

const analyses: Analysis[] = analysesData

export default function Home() {
  return (
    <main className="container mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-8">Analyses</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {analyses.map((analysis) => (
          <Link href={analysis.url} key={analysis.slug}>
            <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader>
                <CardTitle>{analysis.title}</CardTitle>
                <CardDescription>
                  {format(parseISO(analysis.date), "d MMMM yyyy", { locale: nl })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{analysis.summary}</p>
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2">
                {analysis.tags?.map((tag) => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
              </CardFooter>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  )
}

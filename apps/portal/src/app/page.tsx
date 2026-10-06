import { AnalysisCard, type Analysis } from "@/components/AnalysisCard"
import analysesData from "../../public/analyses.json"

const analyses: Analysis[] = analysesData

export default function Home() {
  return (
    <main className="container mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-8">Analyses</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {analyses.map((analysis) => (
          <AnalysisCard key={analysis.slug} analysis={analysis} />
        ))}
      </div>
    </main>
  )
}

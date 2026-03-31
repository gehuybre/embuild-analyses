'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { MapPin, BarChart3 } from 'lucide-react'

export function GIPDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div className="w-full space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="map" className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Kaart
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="w-full overflow-hidden">
            <div
              className="origin-top-left transition-transform"
              style={{
                width: '1200px',
                height: '900px',
                transform: 'scale(min(1, (100vw - 2rem) / 1200))',
                transformOrigin: '0 0'
              }}
            >
              <iframe
                src="https://gehuybre.github.io/gip-dashboard/longread/embed-dashboard.html"
                className="w-full h-full"
                style={{ display: 'block', border: 'none' }}
                frameBorder="0"
                title="GIP Dashboard"
                allow="fullscreen"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Totaal budget</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">€7,4 mld</p>
                <p className="text-sm text-gray-600 mt-1">2025-2027</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Projecten</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">774</p>
                <p className="text-sm text-gray-600 mt-1">Investeringsprojecten</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Op de kaart</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">570</p>
                <p className="text-sm text-gray-600 mt-1">Projecten met locatie</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Top 6 investeringsprogramma's</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold">Asset Management</p>
                      <p className="text-sm text-gray-600">311 projecten</p>
                    </div>
                    <p className="text-lg font-bold">€2,085 mld</p>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: '28%' }}></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold">Grote werken in het wegennet</p>
                      <p className="text-sm text-gray-600">107 projecten</p>
                    </div>
                    <p className="text-lg font-bold">€1,732 mld</p>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: '23%' }}></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold">Duurzaam personenvervoer en modal shift</p>
                      <p className="text-sm text-gray-600">148 projecten</p>
                    </div>
                    <p className="text-lg font-bold">€1,525 mld</p>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-400 h-2 rounded-full" style={{ width: '21%' }}></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold">Diversen en recurrente kosten</p>
                      <p className="text-sm text-gray-600">35 projecten</p>
                    </div>
                    <p className="text-lg font-bold">€597 mln</p>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-300 h-2 rounded-full" style={{ width: '8%' }}></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold">Waterbeheersing</p>
                      <p className="text-sm text-gray-600">61 projecten</p>
                    </div>
                    <p className="text-lg font-bold">€329 mln</p>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-600 h-2 rounded-full" style={{ width: '4%' }}></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold">Grote investeringen in zeehavens</p>
                      <p className="text-sm text-gray-600">9 projecten</p>
                    </div>
                    <p className="text-lg font-bold">€272 mln</p>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: '4%' }}></div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="map" className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Geografische verdeling van projecten</h3>
            <p className="text-sm text-gray-600">
              Interactieve kaart met alle GIP-projecten. Klik op markering voor details. Kleurcodering:
              <span className="inline-block ml-2">
                <span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-1"></span>2025
                <span className="inline-block w-3 h-3 rounded-full bg-yellow-500 mr-1 ml-3"></span>2026
                <span className="inline-block w-3 h-3 rounded-full bg-blue-500 mr-1 ml-3"></span>2027
              </span>
            </p>
          </div>

          <div className="w-full overflow-hidden">
            <div
              className="origin-top-left transition-transform"
              style={{
                width: '1200px',
                height: '700px',
                transform: 'scale(min(1, (100vw - 2rem) / 1200))',
                transformOrigin: '0 0'
              }}
            >
              <iframe
                src="https://gehuybre.github.io/gip-dashboard/longread/embed-map.html"
                className="w-full h-full"
                style={{ display: 'block', border: 'none' }}
                frameBorder="0"
                title="GIP Kaart"
                allow="fullscreen"
              />
            </div>
          </div>

          <p className="text-xs text-gray-600">
            <strong>Opmerking:</strong> Van de 774 investeringsprojecten kunnen er 570 op de kaart weergegeven worden.
            Voor de overige projecten ontbreekt voldoende locatie-informatie. De geografische posities zijn deels automatisch bepaald
            op basis van locatienamen en gemeenten, waardoor er onnauwkeurigheden kunnen voorkomen.
          </p>
        </TabsContent>
      </Tabs>

      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-base">Navigatie tips</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            <strong>Dashboard:</strong> Zoek en filter projecten op programma, entiteit, startjaar en gemeente.
            Exporteer gefilterde data naar CSV.
          </p>
          <p>
            <strong>Kaart:</strong> Klik op markering voor projectdetails. Zoom en pan met knoppen of door te klikken en slepen.
            Gebruik filters om projecten per programma te filteren.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const volumeData = [
  { name: "BBRI", volume: 2400000 },
  { name: "BBCA", volume: 1800000 },
  { name: "BMRI", volume: 2100000 },
  { name: "TLKM", volume: 1500000 },
  { name: "ASII", volume: 1900000 },
];

const portfolioData = [
  { name: "Banking", value: 45, color: "hsl(var(--chart-1))" },
  { name: "Telecom", value: 25, color: "hsl(var(--chart-2))" },
  { name: "Consumer", value: 20, color: "hsl(var(--chart-3))" },
  { name: "Others", value: 10, color: "hsl(var(--chart-4))" },
];

export function SummaryCharts() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Trading Volume</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={volumeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => [value.toLocaleString(), "Volume"]} />
              <Bar dataKey="volume" fill="hsl(var(--chart-2))" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Portfolio Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={portfolioData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}%`}
              >
                {portfolioData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
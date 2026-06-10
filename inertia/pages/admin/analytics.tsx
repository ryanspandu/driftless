
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";

const trafficData = [
  { month: "Jan", visitors: 1200 },
  { month: "Feb", visitors: 1900 },
  { month: "Mar", visitors: 2400 },
  { month: "Apr", visitors: 3100 },
  { month: "May", visitors: 2800 },
  { month: "Jun", visitors: 3600 },
];

const sourceData = [
  { name: "Direct", value: 40 },
  { name: "Search", value: 30 },
  { name: "Social", value: 20 },
  { name: "Referral", value: 10 },
];

const PIE_COLORS = [
  "var(--primary)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
];

const trafficConfig = {
  visitors: { label: "Visitors", color: "var(--primary)" },
} satisfies ChartConfig;

const sourceConfig = {
  Direct: { label: "Direct", color: "var(--primary)" },
  Search: { label: "Search", color: "var(--chart-2)" },
  Social: { label: "Social", color: "var(--chart-3)" },
  Referral: { label: "Referral", color: "var(--chart-4)" },
} satisfies ChartConfig;

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Traffic and audience insights (mock data)
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Visitors over time</CardTitle>
            <CardDescription>
              Monthly unique visitors — Jan to Jun 2026
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={trafficConfig} className="h-[300px] w-full">
              <AreaChart data={trafficData}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  tickMargin={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={40}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="visitors"
                  stroke="var(--color-visitors)"
                  fill="var(--color-visitors)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Traffic sources</CardTitle>
            <CardDescription>Where visitors come from</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <ChartContainer config={sourceConfig} className="h-[200px] w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Pie
                  data={sourceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  nameKey="name"
                >
                  {sourceData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="flex flex-wrap justify-center gap-3 text-sm">
              {sourceData.map((s, i) => (
                <div key={s.name} className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2.5 rounded-full"
                    style={{ backgroundColor: PIE_COLORS[i] }}
                  />
                  <span className="text-muted-foreground">
                    {s.name} ({s.value}%)
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

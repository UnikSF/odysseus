"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtEur } from "@/lib/format";
import type { CategorySpend, MonthlyFlow } from "@/lib/stats";

const tooltipStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid #334155",
  borderRadius: "0.75rem",
  color: "#e2e8f0",
};

export function CategoryDonut({ data }: { data: CategorySpend[] }) {
  if (data.length === 0) {
    return <Empty label="No expenses this month yet" />;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="name"
          innerRadius={70}
          outerRadius={105}
          paddingAngle={2}
          stroke="none"
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value) => fmtEur(Number(value))}
        />
        <Legend
          formatter={(value) => <span style={{ color: "#94a3b8", fontSize: 12 }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function FlowChart({ data }: { data: MonthlyFlow[] }) {
  if (data.length === 0) {
    return <Empty label="No data yet" />;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value) => fmtEur(Number(value))}
          cursor={{ fill: "#1e293b", opacity: 0.4 }}
        />
        <Bar dataKey="income" name="Income" fill="#34d399" radius={[6, 6, 0, 0]} />
        <Bar dataKey="expenses" name="Expenses" fill="#fb7185" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center text-sm text-slate-500">
      {label}
    </div>
  );
}

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const CreditTimelineChart = ({ data }) => (
  <div className="h-64 w-full">
    <ResponsiveContainer>
      <LineChart data={data}>
        <XAxis dataKey="date" />
        <YAxis domain={[300, 850]} />
        <Tooltip />
        {/* Historical Data */}
        <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} />
        {/* Visual marker for "Today" */}
        <ReferenceLine x={new Date().toLocaleDateString()} stroke="red" label="Today" />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";

const transactionData = [
  {
    id: "1",
    symbol: "BBRI",
    type: "BUY",
    quantity: 1000,
    price: 4600,
    total: 4600000,
    time: "09:15:30",
  },
  {
    id: "2",
    symbol: "BBCA",
    type: "SELL",
    quantity: 500,
    price: 9150,
    total: 4575000,
    time: "10:22:15",
  },
  {
    id: "3",
    symbol: "BMRI",
    type: "BUY",
    quantity: 750,
    price: 5600,
    total: 4200000,
    time: "11:45:20",
  },
  {
    id: "4",
    symbol: "TLKM",
    type: "SELL",
    quantity: 1200,
    price: 3600,
    total: 4320000,
    time: "13:30:45",
  },
  {
    id: "5",
    symbol: "ASII",
    type: "BUY",
    quantity: 800,
    price: 5100,
    total: 4080000,
    time: "14:15:10",
  },
];

export function DataTable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactionData.map((transaction) => (
              <TableRow key={transaction.id}>
                <TableCell className="font-medium">{transaction.symbol}</TableCell>
                <TableCell>
                  <Badge variant={transaction.type === "BUY" ? "default" : "secondary"}>
                    {transaction.type}
                  </Badge>
                </TableCell>
                <TableCell>{transaction.quantity.toLocaleString()}</TableCell>
                <TableCell>{transaction.price.toLocaleString()}</TableCell>
                <TableCell>{transaction.total.toLocaleString()}</TableCell>
                <TableCell>{transaction.time}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
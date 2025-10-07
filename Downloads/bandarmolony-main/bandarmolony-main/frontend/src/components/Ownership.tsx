import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';

const ownershipData = [
  {
    id: "1",
    shareholder: "Government of Indonesia",
    shares: 75000000000,
    percentage: 56.75,
    type: "Government",
    change: 0,
  },
  {
    id: "2", 
    shareholder: "Public",
    shares: 32500000000,
    percentage: 24.62,
    type: "Public",
    change: 0.12,
  },
  {
    id: "3",
    shareholder: "Treasury Stock",
    shares: 8750000000,
    percentage: 6.63,
    type: "Treasury",
    change: 0,
  },
  {
    id: "4",
    shareholder: "Employee Stock Program",
    shares: 5625000000,
    percentage: 4.26,
    type: "Employee",
    change: 0.05,
  },
  {
    id: "5",
    shareholder: "Management",
    shares: 3125000000,
    percentage: 2.37,
    type: "Management",
    change: -0.02,
  },
  {
    id: "6",
    shareholder: "Strategic Partners",
    shares: 7000000000,
    percentage: 5.30,
    type: "Strategic",
    change: 0.08,
  },
];

export function Ownership() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ownership Structure</CardTitle>
        <p className="text-sm text-muted-foreground">Current shareholding composition</p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shareholder</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Shares</TableHead>
              <TableHead className="text-right">Percentage</TableHead>
              <TableHead className="text-right">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ownershipData.map((owner) => (
              <TableRow key={owner.id}>
                <TableCell className="font-medium">{owner.shareholder}</TableCell>
                <TableCell>
                  <Badge variant="outline">{owner.type}</Badge>
                </TableCell>
                <TableCell className="text-right">{owner.shares.toLocaleString()}</TableCell>
                <TableCell className="text-right font-medium">{owner.percentage}%</TableCell>
                <TableCell className="text-right">
                  {owner.change !== 0 && (
                    <span className={owner.change > 0 ? "text-green-600" : "text-red-600"}>
                      {owner.change > 0 ? "+" : ""}{owner.change}%
                    </span>
                  )}
                  {owner.change === 0 && (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
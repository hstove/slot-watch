"use client";
import * as React from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  type SortingState,
  type SortDirection,
  type Column,
  type SortingColumn,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "./button";
import { ArrowDownIcon, ArrowUpIcon } from "@radix-ui/react-icons";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

export function DataTable<TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// type ColumnGeneric = SortingColumn<unknown>;
type ColumnGeneric = {
  getIsSorted: () => false | SortDirection;
  toggleSorting: (ascending: boolean) => void;
  getToggleSortingHandler: () => undefined | ((event: unknown) => void);
};

export interface SortableHeaderProps<T extends ColumnGeneric>
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  // sortState: false | SortDirection;
  column: T;
}

export const SortableHeader = <T extends ColumnGeneric>({
  column,
  children,
  className,
}: SortableHeaderProps<T>) => {
  const sortState = column.getIsSorted();
  function sortArrow() {
    if (sortState === "asc") {
      return <ArrowUpIcon className="ml-2 h-4 w-4" />;
    }
    if (sortState === "desc") {
      return <ArrowDownIcon className="ml-2 h-4 w-4" />;
    }
    return <div className="ml-2 h-4 w-4" />;
  }
  return (
    <Button
      variant="ghost"
      onClick={column.getToggleSortingHandler?.()}
      className={className}
    >
      {children}
      {sortArrow()}
    </Button>
  );
};

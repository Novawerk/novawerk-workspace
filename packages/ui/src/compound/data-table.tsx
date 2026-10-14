import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type Row,
  type RowData,
  type SortingState,
} from "@tanstack/react-table"
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, SearchIcon } from "lucide-react"

import { Button } from "@nw/ui/core/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@nw/ui/core/components/ui/input-group"
import { Skeleton } from "@nw/ui/core/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@nw/ui/core/components/ui/table"
import { cn } from "@nw/ui/lib/utils"

export type { ColumnDef } from "@tanstack/react-table"

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    /**
     * Classes for the column's header and cells. The table is a size container, so
     * `hidden @2xl:table-cell` shows a column only when the table itself is wide enough.
     */
    className?: string
  }
}

export type DataTableProps<TData, TValue = unknown> = {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  /** Stable id per row. Needed for `selectedRowId`. */
  getRowId?: (row: TData, index: number) => string
  /** Makes rows clickable (and keyboard-activatable). */
  onRowClick?: (row: TData) => void
  /** Highlights the row with this id, e.g. the one open in a detail pane. */
  selectedRowId?: string | null
  isLoading?: boolean
  /** Rendered in place of the rows when there is no data. */
  emptyState?: React.ReactNode
  /** Shows a search box that filters across all columns. */
  searchPlaceholder?: string
  /** Extra controls next to the search box (filters, actions). */
  toolbar?: React.ReactNode
  /** Turns on client-side pagination with this page size. */
  pageSize?: number
  initialSorting?: SortingState
  /** Hide the header row, e.g. for a compact list in a split view. */
  hideHeader?: boolean
  className?: string
}

/**
 * The shadcn data table (TanStack Table + our Table primitives) packaged as one component.
 * Column definitions stay in the screen; this handles sorting, search, selection and states.
 * It is an `@container`: columns can hide themselves (`meta.className`) when the table is narrow.
 */
export function DataTable<TData, TValue = unknown>({
  columns,
  data,
  getRowId,
  onRowClick,
  selectedRowId,
  isLoading,
  emptyState,
  searchPlaceholder,
  toolbar,
  pageSize,
  initialSorting = [],
  hideHeader,
  className,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting)
  const [globalFilter, setGlobalFilter] = React.useState("")

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(pageSize
      ? {
          getPaginationRowModel: getPaginationRowModel(),
          initialState: { pagination: { pageSize, pageIndex: 0 } },
        }
      : {}),
  })

  const rows = table.getRowModel().rows
  const showToolbar = Boolean(searchPlaceholder || toolbar)

  const activate = (row: Row<TData>) => onRowClick?.(row.original)

  return (
    <div data-slot="data-table" className={cn("@container flex min-h-0 flex-col gap-3", className)}>
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {searchPlaceholder && (
            <InputGroup className="w-full sm:max-w-xs">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={globalFilter}
                onChange={(event) => setGlobalFilter(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
              />
            </InputGroup>
          )}
          {toolbar}
        </div>
      )}

      <div className="min-h-0 overflow-auto rounded-lg border">
        <Table>
          {!hideHeader && (
            <TableHeader className="sticky top-0 z-10 bg-background">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      style={{ width: header.column.columnDef.size }}
                      className={header.column.columnDef.meta?.className}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
          )}
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                  {columns.map((column, j) => (
                    <TableCell key={j} className={column.meta?.className}>
                      <Skeleton className="h-4 w-full max-w-40" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length ? (
              rows.map((row) => {
                const selected = selectedRowId != null && row.id === selectedRowId
                return (
                  <TableRow
                    key={row.id}
                    data-state={selected ? "selected" : undefined}
                    aria-selected={onRowClick ? selected : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onClick={onRowClick ? () => activate(row) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault()
                              activate(row)
                            }
                          }
                        : undefined
                    }
                    className={cn(
                      onRowClick &&
                        "cursor-pointer outline-none focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
                      "data-[state=selected]:bg-primary/8 data-[state=selected]:hover:bg-primary/12"
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  {emptyState ?? "Nothing here yet."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pageSize && table.getPageCount() > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <span>
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

/** A sortable column header. Use it as `header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />`. */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<TData, TValue>
  title: string
  className?: string
}) {
  if (!column.getCanSort()) {
    return <span className={className}>{title}</span>
  }
  const sorted = column.getIsSorted()
  const Icon = sorted === "asc" ? ArrowUpIcon : sorted === "desc" ? ArrowDownIcon : ArrowUpDownIcon
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("-ml-2 h-7 px-2 font-medium", className)}
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {title}
      <Icon className={cn("size-3.5", !sorted && "text-muted-foreground")} />
    </Button>
  )
}

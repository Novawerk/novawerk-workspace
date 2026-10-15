# tasks/

Task batches for the contributor board, imported with `pnpm import:tasks` (docs/runbook.md).
Each file is a JSON array in the `taskImportInput` shape (see `scripts/tasks.example.json`).

To import a batch into production, run the **Import tasks** workflow from the Actions tab:
first with `apply` off (a dry run that also checks titles and the member against the board),
then with `apply` on. Imported files stay here as the record of what was published.

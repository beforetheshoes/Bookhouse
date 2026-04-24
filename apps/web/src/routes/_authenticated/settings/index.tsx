import { useEffect, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ExternalLink,
  FolderOpen,
  Loader2,
  Monitor,
  Moon,
  OctagonX,
  Play,
  Sun,
  Trash2,
} from "lucide-react";
import { useSSE } from "~/hooks/use-sse";
import { useTheme } from "~/hooks/use-theme";
import { useAppColor } from "~/hooks/use-app-color";
import { VirtualizedDataTable, DataTableColumnHeader } from "~/components/data-table";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Progress } from "~/components/ui/progress";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { AddLibraryRootDialog } from "~/components/settings/add-library-root-dialog";
import {
  getLibraryRootsServerFn,
  getLibraryIssueCountServerFn,
  getScanProgressServerFn,
  removeLibraryRootServerFn,
  scanLibraryRootServerFn,
  type LibraryRootRow,
} from "~/lib/server-fns/library-roots";
import {
  getMissingFileBehaviorServerFn,
  setMissingFileBehaviorServerFn,
  getAllScanConcurrenciesServerFn,
  setScanConcurrencyServerFn,
  type MissingFileBehavior,
  type ScanType,
} from "~/lib/server-fns/app-settings";
import type { ThemePreference, ColorMode } from "~/lib/server-fns/app-settings";
import {
  getIntegrationStatusServerFn,
  setApiKeyServerFn,
  removeApiKeyServerFn,
  validateApiKeyServerFn,
  type IntegrationProvider,
} from "~/lib/server-fns/integrations";
import {
  getBackupHistoryServerFn,
  recordBackupServerFn,
} from "~/lib/server-fns/backup";
import { getSmtpStatusServerFn } from "~/lib/server-fns/smtp";
import { getKindleStatusServerFn } from "~/lib/server-fns/kindle";
import {
  getKoboDevicesServerFn,
  addKoboDeviceServerFn,
  revokeKoboDeviceServerFn,
  removeKoboDeviceServerFn,
  updateDeviceCollectionsServerFn,
  type KoboDeviceRow,
} from "~/lib/server-fns/kobo-devices";
import {
  getOpdsCredentialsServerFn,
  createOpdsCredentialServerFn,
  toggleOpdsCredentialServerFn,
  deleteOpdsCredentialServerFn,
  type OpdsCredentialRow,
} from "~/lib/server-fns/opds-credentials";
import {
  getKoreaderCredentialServerFn,
  saveKoreaderCredentialServerFn,
  toggleKoreaderCredentialServerFn,
  type KoreaderCredentialRow,
} from "~/lib/server-fns/koreader-credentials";
import { getShelvesServerFn, type ShelfRow } from "~/lib/server-fns/shelves";
import {
  getImportJobsServerFn,
  stopAllJobsServerFn,
  type ImportJobRow,
} from "~/lib/server-fns/import-jobs";
import { runMutation } from "~/lib/mutation";
import { BackupTab } from "~/components/settings/backup-tab";
import { SmtpConfigCard } from "~/components/settings/smtp-config-card";
import { KindleConfigCard } from "~/components/settings/kindle-config-card";
import type { BackupManifest } from "~/lib/backup/manifest";

export interface LibraryRootWithExtras extends LibraryRootRow {
  scanProgress: Awaited<ReturnType<typeof getScanProgressServerFn>> | null;
  issueCount: number;
}

export const Route = createFileRoute("/_authenticated/settings/")({
  loader: async () => {
    const [roots, missingFileBehavior, jobsResult, concurrencies, integrations, backupHistory, smtpStatus, kindleStatus, koboDevices, shelves, opdsCredentials, koreaderCredential] = await Promise.all([
      getLibraryRootsServerFn(),
      getMissingFileBehaviorServerFn(),
      getImportJobsServerFn({ data: { page: 1, pageSize: 100 } }),
      getAllScanConcurrenciesServerFn(),
      getIntegrationStatusServerFn(),
      getBackupHistoryServerFn(),
      getSmtpStatusServerFn(),
      getKindleStatusServerFn(),
      getKoboDevicesServerFn(),
      getShelvesServerFn(),
      getOpdsCredentialsServerFn(),
      getKoreaderCredentialServerFn(),
    ]);
    const rootsWithExtras: LibraryRootWithExtras[] = await Promise.all(
      roots.map(async (root) => {
        const [scanProgress, issueCount] = await Promise.all([
          getScanProgressServerFn({ data: { libraryRootId: root.id } }),
          getLibraryIssueCountServerFn({ data: { libraryRootId: root.id } }),
        ]);
        return { ...root, scanProgress, issueCount };
      }),
    );
    return {
      roots: rootsWithExtras,
      missingFileBehavior,
      jobs: jobsResult.jobs,
      totalCount: jobsResult.totalCount,
      concurrencies,
      integrations,
      backupHistory,
      smtpStatus,
      kindleStatus,
      koboDevices,
      shelves,
      opdsCredentials,
      koreaderCredential,
    };
  },
  pendingComponent: SettingsSkeleton,
  component: SettingsPage,
});

function SettingsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-9 w-40" />
      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  );
}

function SettingsPage() {
  const { roots, missingFileBehavior, jobs, totalCount, concurrencies, integrations, backupHistory: initialBackupHistory, smtpStatus, kindleStatus, koboDevices, shelves, opdsCredentials, koreaderCredential } = Route.useLoaderData();
  const [backupHistory, setBackupHistory] = useState(initialBackupHistory);

  const handleBackupComplete = async (manifest: BackupManifest) => {
    try {
      await recordBackupServerFn({ data: manifest });
      setBackupHistory((prev) => [manifest, ...prev].slice(0, 20));
    } catch {
      // non-critical
    }
  };

  const hasActiveScan = roots.some((r) => r.scanProgress !== null);
  const hasActiveJobs = jobs.some(
    (j) => j.status === "QUEUED" || j.status === "RUNNING",
  );
  useSSE({ enabled: hasActiveScan || hasActiveJobs });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Tabs defaultValue="library">
        <TabsList className="h-10">
          <TabsTrigger value="library" className="px-4 py-1.5">Library</TabsTrigger>
          <TabsTrigger value="appearance" className="px-4 py-1.5">Appearance</TabsTrigger>
          <TabsTrigger value="jobs" className="px-4 py-1.5">Jobs</TabsTrigger>
          <TabsTrigger value="integrations" className="px-4 py-1.5">Integrations</TabsTrigger>
          <TabsTrigger value="backup" className="px-4 py-1.5">Backup</TabsTrigger>
          <TabsTrigger value="devices" className="px-4 py-1.5">Devices</TabsTrigger>
        </TabsList>

        <TabsContent value="library" forceMount className="space-y-6 data-[state=inactive]:hidden">
          <LibraryTab roots={roots} missingFileBehavior={missingFileBehavior} />
        </TabsContent>

        <TabsContent value="appearance" forceMount className="space-y-6 data-[state=inactive]:hidden">
          <AppearanceCard />
          <ColorCard />
        </TabsContent>

        <TabsContent value="jobs" forceMount className="space-y-6 data-[state=inactive]:hidden">
          <JobsTab jobs={jobs} totalCount={totalCount} initialConcurrencies={concurrencies} />
        </TabsContent>

        <TabsContent value="integrations" forceMount className="space-y-6 data-[state=inactive]:hidden">
          <IntegrationsTab integrations={integrations} smtpConfigured={smtpStatus.configured} kindleConfigured={kindleStatus.configured} />
        </TabsContent>

        <TabsContent value="backup" forceMount className="space-y-6 data-[state=inactive]:hidden">
          <BackupTab history={backupHistory} onBackupComplete={(manifest) => { void handleBackupComplete(manifest); }} />
        </TabsContent>

        <TabsContent value="devices" forceMount className="space-y-6 data-[state=inactive]:hidden">
          <KoreaderSyncCard credential={koreaderCredential} />
          <OpdsCredentialsCard credentials={opdsCredentials} />
          <KoboDevicesTab devices={koboDevices} shelves={shelves} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KoreaderSyncCard({ credential }: { credential: KoreaderCredentialRow }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [username, setUsername] = useState(credential?.username ?? "");
  const [password, setPassword] = useState("");
  const [apiUrl, setApiUrl] = useState("/api/koreader");

  useEffect(() => { setApiUrl(`${window.location.origin}/api/koreader`); }, []);
  useEffect(() => { setUsername(credential?.username ?? ""); }, [credential?.username]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveKoreaderCredentialServerFn({ data: { username, password } });
      setPassword("");
      toast.success("KOReader credentials saved");
      void router.invalidate();
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (currentCredential: NonNullable<KoreaderCredentialRow>) => {
    setToggling(true);
    try {
      await toggleKoreaderCredentialServerFn({ data: { isEnabled: !currentCredential.isEnabled } });
      toast.success(currentCredential.isEnabled ? "KOReader sync disabled" : "KOReader sync enabled");
      void router.invalidate();
    } finally {
      setToggling(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>KOReader Progress Sync</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950">
          <p className="text-sm font-medium">Custom Sync Server URL</p>
          <code className="mt-1 block break-all rounded bg-white p-2 text-xs dark:bg-gray-900" data-testid="koreader-api-url">
            {apiUrl}
          </code>
          <p className="mt-2 text-xs text-muted-foreground">
            In KOReader, use Progress sync, choose Custom sync server, and select Binary document matching.
          </p>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Badge variant={credential?.isEnabled ? "default" : "secondary"}>
            {credential?.isEnabled ? "Enabled" : "Disabled"}
          </Badge>
          {credential?.username && <span className="text-muted-foreground">Username: {credential.username}</span>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="KOReader username"
            value={username}
            onChange={(e) => { setUsername(e.target.value); }}
            className="max-w-xs"
            data-testid="koreader-username-input"
          />
          <Input
            type="password"
            placeholder="Password (min 8 chars)"
            value={password}
            onChange={(e) => { setPassword(e.target.value); }}
            className="max-w-xs"
            data-testid="koreader-password-input"
          />
          <Button
            onClick={() => { void handleSave(); }}
            disabled={saving || !username.trim() || password.length < 8}
            data-testid="save-koreader-credential-btn"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : credential ? "Update Credentials" : "Save Credentials"}
          </Button>
          <Button
            variant="outline"
            onClick={credential ? () => { void handleToggle(credential); } : undefined}
            disabled={toggling || !credential}
            data-testid="toggle-koreader-credential-btn"
          >
            {toggling ? <Loader2 className="h-4 w-4 animate-spin" /> : credential?.isEnabled ? "Disable" : "Enable"}
          </Button>
        </div>

        {!credential && (
          <p className="text-sm text-muted-foreground">Save KOReader credentials before enabling sync.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Library Tab
// ---------------------------------------------------------------------------

function LibraryTab({
  roots,
  missingFileBehavior,
}: {
  roots: LibraryRootWithExtras[];
  missingFileBehavior: MissingFileBehavior;
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Manage directories that Bookhouse scans for content.
        </p>
        <AddLibraryRootDialog />
      </div>

      {roots.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FolderOpen className="size-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              No library roots configured. Add one to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {roots.map((root) => (
            <LibraryRootCard key={root.id} root={root} />
          ))}
        </div>
      )}

      <MissingFileBehaviorCard initialBehavior={missingFileBehavior} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Appearance Tab
// ---------------------------------------------------------------------------

const themeOptions: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function AppearanceCard() {
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Choose how Bookhouse looks to you.
        </p>
        <div className="inline-flex items-center rounded-lg border bg-muted p-1" role="radiogroup" aria-label="Theme">
          {themeOptions.map((option) => {
            const isActive = theme === option.value;
            return (
              <Button
                key={option.value}
                variant={isActive ? "default" : "ghost"}
                size="sm"
                role="radio"
                aria-checked={isActive}
                aria-label={option.label}
                onClick={() => { setTheme(option.value); }}
                className={isActive ? "" : "text-muted-foreground"}
              >
                <option.icon className="size-4" />
                {option.label}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

const COLOR_MODE_OPTIONS: { value: ColorMode; label: string; description: string }[] = [
  { value: "off", label: "Off", description: "No ambient color" },
  { value: "book", label: "Book", description: "Last viewed book's cover colors" },
  { value: "page", label: "Page", description: "Color by page type" },
  { value: "accent", label: "Custom", description: "Your chosen accent color" },
];

function ColorCard() {
  const { colorMode, setColorMode, accentColor, setAccentColor } = useAppColor();
  const [hexInput, setHexInput] = useState(accentColor ?? "#3366cc");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Color</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Choose how Bookhouse uses ambient color.
        </p>
        <div className="space-y-2">
          {COLOR_MODE_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="colorMode"
                value={option.value}
                checked={colorMode === option.value}
                onChange={() => { setColorMode(option.value); }}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-medium">{option.label}</p>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </div>
            </label>
          ))}
        </div>
        {colorMode === "accent" && (
          <div className="flex items-center gap-3 pl-6">
            <input
              type="color"
              value={hexInput}
              onInput={(e) => {
                const value = (e.target as HTMLInputElement).value;
                setHexInput(value);
                setAccentColor(value);
              }}
              className="size-8 cursor-pointer rounded-md border-0 p-0"
            />
            <Input
              type="text"
              value={hexInput}
              onChange={(e) => { setHexInput(e.target.value); }}
              onBlur={() => {
                if (/^#[0-9a-fA-F]{6}$/.test(hexInput)) {
                  setAccentColor(hexInput);
                }
              }}
              placeholder="#3366cc"
              className="w-28 font-mono text-sm"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Jobs Tab
// ---------------------------------------------------------------------------

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  QUEUED: "secondary",
  RUNNING: "default",
  SUCCEEDED: "outline",
  FAILED: "destructive",
};

function formatDuration(job: ImportJobRow): string {
  if (!job.startedAt) return "—";
  const start = new Date(job.startedAt).getTime();
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${String(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatKind(kind: string): string {
  return kind.replace(/_/g, " ");
}

const jobColumns: ColumnDef<ImportJobRow>[] = [
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => (
      <Badge variant={statusVariant[row.original.status] ?? "secondary"}>
        {row.original.status}
      </Badge>
    ),
    size: 100,
  },
  {
    accessorKey: "kind",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Kind" />
    ),
    cell: ({ row }) => (
      <Badge variant="outline">{formatKind(row.original.kind)}</Badge>
    ),
  },
  {
    id: "libraryRoot",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Library Root" />
    ),
    accessorFn: (row) => row.libraryRoot?.name ?? "—",
  },
  {
    id: "created",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    accessorFn: (row) => new Date(row.createdAt).getTime(),
    cell: ({ row }) =>
      formatDistanceToNow(new Date(row.original.createdAt), {
        addSuffix: true,
      }),
    size: 120,
  },
  {
    id: "duration",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Duration" />
    ),
    accessorFn: (row) => {
      if (!row.startedAt) return -1;
      const start = new Date(row.startedAt).getTime();
      const end = row.finishedAt ? new Date(row.finishedAt).getTime() : Date.now();
      return end - start;
    },
    cell: ({ row }) => formatDuration(row.original),
    size: 80,
  },
  {
    id: "attempts",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Attempts" />
    ),
    accessorFn: (row) => row.attemptsMade,
    cell: ({ row }) => row.original.attemptsMade,
    size: 80,
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <Button variant="ghost" size="sm" asChild>
        <Link
          to="/settings/jobs/$jobId"
          params={{ jobId: row.original.id }}
        >
          <ExternalLink className="size-4" />
        </Link>
      </Button>
    ),
    size: 50,
  },
];

type ScanConcurrencies = Record<ScanType, number>;

const SCAN_TYPE_LABELS: Record<ScanType, string> = {
  full: "Full Scan:",
  onDemand: "On-demand:",
  incremental: "Incremental:",
};

function JobsTab({
  jobs,
  totalCount,
  initialConcurrencies,
}: {
  jobs: ImportJobRow[];
  totalCount: number;
  initialConcurrencies: ScanConcurrencies;
}) {
  const router = useRouter();
  const [stopping, setStopping] = useState(false);
  const [concurrencies, setConcurrencies] = useState<ScanConcurrencies>(initialConcurrencies);
  const [savingConcurrency, setSavingConcurrency] = useState(false);
  const concurrencyChanged = (Object.keys(concurrencies) as ScanType[]).some(
    (k) => concurrencies[k] !== initialConcurrencies[k],
  );

  async function handleStopAll() {
    if (!window.confirm("Stop all running and queued jobs? This cannot be undone.")) return;
    setStopping(true);
    await runMutation(() => stopAllJobsServerFn(), { success: "All jobs stopped" });
    setStopping(false);
    void router.invalidate();
  }

  async function handleSaveConcurrency() {
    setSavingConcurrency(true);
    const changed = (Object.keys(concurrencies) as ScanType[]).filter(
      (k) => concurrencies[k] !== initialConcurrencies[k],
    );
    await runMutation(
      async () => {
        for (const scanType of changed) {
          await setScanConcurrencyServerFn({ data: { scanType, concurrency: concurrencies[scanType] } });
        }
      },
      { success: "Worker concurrency updated" },
    );
    setSavingConcurrency(false);
    void router.invalidate();
  }

  return (
    <>
      <div className="flex items-start justify-between">
        <p className="text-sm text-muted-foreground">
          Monitor the status of library import and processing jobs.
        </p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {(Object.keys(SCAN_TYPE_LABELS) as ScanType[]).map((scanType) => (
              <div key={scanType} className="flex items-center gap-1">
                <label className="text-sm text-muted-foreground whitespace-nowrap">{SCAN_TYPE_LABELS[scanType]}</label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={concurrencies[scanType]}
                  onChange={(e) => { setConcurrencies((prev) => ({ ...prev, [scanType]: Number(e.target.value) })); }}
                  className="w-20"
                />
              </div>
            ))}
            {concurrencyChanged && (
              <Button
                size="sm"
                variant="outline"
                aria-label="Save concurrency"
                onClick={() => void handleSaveConcurrency()}
                disabled={savingConcurrency}
              >
                Save
              </Button>
            )}
          </div>
          <Button variant="destructive" size="sm" onClick={() => void handleStopAll()} disabled={stopping}>
            <OctagonX className="mr-2 size-4" />
            Stop All Jobs
          </Button>
        </div>
      </div>
      <VirtualizedDataTable
        columns={jobColumns}
        data={jobs}
        filterColumn="kind"
        filterPlaceholder="Filter by kind..."
        pageSize={20}
      />
      {totalCount > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          {totalCount} total job{totalCount !== 1 ? "s" : ""}
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared Components
// ---------------------------------------------------------------------------

function MissingFileBehaviorCard({ initialBehavior }: { initialBehavior: MissingFileBehavior }) {
  const [behavior, setBehavior] = useState<MissingFileBehavior>(initialBehavior);
  const [saving, setSaving] = useState(false);

  async function handleChange(value: MissingFileBehavior) {
    setBehavior(value);
    setSaving(true);
    try {
      await setMissingFileBehaviorServerFn({ data: { behavior: value } });
      toast.success("Missing file behavior updated");
    } catch {
      toast.error("Failed to update setting");
      setBehavior(initialBehavior);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Missing File Behavior</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          When files are no longer found on disk during a scan, choose what happens to their library entries.
        </p>
        <div className="space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="missingFileBehavior"
              value="manual"
              checked={behavior === "manual"}
              onChange={() => { void handleChange("manual"); }}
              disabled={saving}
              className="mt-1"
            />
            <div>
              <p className="text-sm font-medium">Manual review</p>
              <p className="text-xs text-muted-foreground">
                Files are marked as missing but kept in the library. You can review and clean them up from the Missing Files page.
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="missingFileBehavior"
              value="auto-cleanup"
              checked={behavior === "auto-cleanup"}
              onChange={() => { void handleChange("auto-cleanup"); }}
              disabled={saving}
              className="mt-1"
            />
            <div>
              <p className="text-sm font-medium">Auto-cleanup during scan</p>
              <p className="text-xs text-muted-foreground">
                Missing files and their library entries are automatically removed. Editions with no remaining files are deleted, and works with no remaining editions are deleted.
              </p>
            </div>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

function LibraryRootCard({ root }: { root: LibraryRootWithExtras }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [startingScanButton, setStartingScanButton] = useState<"default" | "full" | null>(null);

  async function handleScan(
    scanMode: "FULL" | "INCREMENTAL",
    startingButton: "default" | "full",
  ) {
    setStartingScanButton(startingButton);
    setScanning(true);
    try {
      const result = await scanLibraryRootServerFn({
        data: { libraryRootId: root.id, scanMode },
      });
      toast.success(`Scan started for "${root.name}"`, {
        action: {
          label: "View Job",
          onClick: () => {
            void router.navigate({
              to: "/settings/jobs/$jobId",
              params: { jobId: result.importJobId },
            });
          },
        },
      });
      void router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start scan",
      );
    } finally {
      setScanning(false);
      setStartingScanButton(null);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await removeLibraryRootServerFn({ data: { id: root.id } });
      toast.success(`"${root.name}" removed`);
      setDeleteOpen(false);
      void router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to remove library root",
      );
    } finally {
      setDeleting(false);
    }
  }

  const lastScanned = root.lastScannedAt
    ? new Date(root.lastScannedAt).toLocaleString()
    : "Never";

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                {root.name}
                {!root.isEnabled && (
                  <Badge variant="secondary">Disabled</Badge>
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground font-mono">
                {root.path}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { void handleScan(root.scanMode, "default"); }}
                disabled={scanning || root.scanProgress !== null}
              >
                {root.scanProgress ? (
                  root.scanProgress.stale ? (
                    <>
                      <AlertTriangle className="size-4 text-amber-600" />
                      Scan Stalled
                    </>
                  ) : (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Scanning...
                    </>
                  )
                ) : scanning && startingScanButton === "default" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="size-4" />
                    Scan Now
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { void handleScan("FULL", "full"); }}
                disabled={scanning || root.scanProgress !== null}
              >
                {scanning && startingScanButton === "full" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="size-4" />
                    Full Scan
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Remove ${root.name}`}
                onClick={() => { setDeleteOpen(true); }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Kind:</span>
              <Badge variant="outline">{root.kind}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Default Scan:</span>
              <Badge variant="outline">{root.scanMode}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Last scanned:</span>
              <span>{lastScanned}</span>
            </div>
            {root.issueCount > 0 && (
              <Link
                to="/settings/library-issues/$libraryRootId"
                params={{ libraryRootId: root.id }}
                className="flex items-center gap-1.5 text-destructive hover:underline"
              >
                <AlertCircle className="size-3.5" />
                <span>{root.issueCount} {root.issueCount === 1 ? "issue" : "issues"}</span>
              </Link>
            )}
          </div>
          {root.scanProgress && (
            <div className="space-y-1.5">
              {root.scanProgress.stale ? (
                <>
                  <Progress
                    value={root.scanProgress.processedFiles ?? 0}
                    max={root.scanProgress.totalFiles ?? 1}
                  />
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="size-3.5" />
                    Scan appears stalled — no progress updates received
                  </p>
                </>
              ) : root.scanProgress.scanStage === "PROCESSING" ? (
                <>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" />
                    Processing library...
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Metadata extraction, cover processing, and edition matching continue automatically in the background.
                  </p>
                </>
              ) : (
                <>
                  <Progress
                    value={root.scanProgress.processedFiles ?? 0}
                    max={root.scanProgress.totalFiles ?? 1}
                  />
                  <p className="text-xs text-muted-foreground">
                    Discovering files... {root.scanProgress.processedFiles ?? 0} / {root.scanProgress.totalFiles ?? "?"} files
                    {root.scanProgress.errorCount ? ` (${String(root.scanProgress.errorCount)} errors)` : ""}
                  </p>
                </>
              )}
              <p className="text-xs text-muted-foreground/80 italic">
                Books may appear incomplete until the scan finishes. Covers, metadata, and edition matching happen automatically — no action needed on your part.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Library Root</DialogTitle>
            <DialogDescription>
              This will remove "{root.name}" and all associated file records.
              The actual files on disk will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDeleteOpen(false); }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => { void handleDelete(); }}
              disabled={deleting}
            >
              {deleting ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Integrations Tab
// ---------------------------------------------------------------------------

type IntegrationStatus = { configured: boolean; label: string };

function IntegrationsTab({
  integrations,
  smtpConfigured,
  kindleConfigured,
}: {
  integrations: Record<string, IntegrationStatus>;
  smtpConfigured: boolean;
  kindleConfigured: boolean;
}) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Connect to external metadata sources. Open Library is always available. Google Books and Hardcover require API keys.
      </p>
      <div className="grid gap-4">
        {Object.entries(integrations).map(([provider, status]) => (
          <IntegrationCard key={provider} provider={provider} status={status} />
        ))}
      </div>
      <SmtpConfigCard configured={smtpConfigured} />
      <KindleConfigCard configured={kindleConfigured} />
    </>
  );
}

type SaveState = "idle" | "validating" | "saving" | "saved" | "error";

function IntegrationCard({ provider, status }: { provider: string; status: IntegrationStatus }) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const requiresKey = provider !== "openlibrary";

  async function handleSave() {
    const trimmedKey = apiKey.trim();
    setSaveError(null);
    setSaveState("validating");

    try {
      const validation = await validateApiKeyServerFn({
        data: { provider: provider as IntegrationProvider, apiKey: trimmedKey },
      }) as { valid: boolean; error?: string };

      if (!validation.valid) {
        setSaveState("error");
        setSaveError(validation.error ?? "API key validation failed");
        return;
      }

      setSaveState("saving");
      await setApiKeyServerFn({ data: { provider: provider as IntegrationProvider, apiKey: trimmedKey } });
      setSaveState("saved");
      setApiKey("");
      void router.invalidate();
    } catch (error) {
      setSaveState("error");
      const message = error instanceof Error ? error.message : "Unknown error";
      setSaveError(`Failed to save: ${message}`);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await removeApiKeyServerFn({ data: { provider: provider as IntegrationProvider } });
      toast.success(`${status.label} API key removed`);
      void router.invalidate();
    } catch {
      toast.error("Failed to remove API key");
    } finally {
      setRemoving(false);
    }
  }

  const isBusy = saveState === "validating" || saveState === "saving";
  const SAVE_BUTTON_LABELS: Record<SaveState, string> = {
    idle: "Save Key",
    validating: "Validating...",
    saving: "Saving...",
    saved: "✓ Saved",
    error: "Save Key",
  };
  const buttonLabel = SAVE_BUTTON_LABELS[saveState];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {status.label}
          <Badge variant={status.configured ? "default" : "secondary"}>
            {status.configured ? "Connected" : "Not configured"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!requiresKey && (
          <p className="text-sm text-muted-foreground">No API key required. Always available.</p>
        )}
        {requiresKey && !status.configured && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                type="password"
                placeholder="Enter API key"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setSaveState("idle"); setSaveError(null); }}
                className="max-w-sm"
              />
              <Button
                size="sm"
                variant={saveState === "saved" ? "default" : saveState === "error" ? "destructive" : "default"}
                onClick={() => { void handleSave(); }}
                disabled={isBusy || !apiKey.trim()}
              >
                {buttonLabel}
              </Button>
            </div>
            {saveState === "error" && saveError && (
              <p className="text-sm text-destructive">{saveError}</p>
            )}
          </div>
        )}
        {requiresKey && status.configured && (
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">API key configured</p>
            <Button variant="outline" size="sm" onClick={() => { void handleRemove(); }} disabled={removing}>
              {removing ? "Removing..." : "Remove"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Kobo Devices Tab
// ---------------------------------------------------------------------------

function OpdsCredentialsCard({ credentials }: { credentials: OpdsCredentialRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [catalogUrl, setCatalogUrl] = useState("/opds/catalog");

  const handleAdd = async () => {
    setAdding(true);
    try {
      await createOpdsCredentialServerFn({ data: { username: newUsername.trim(), password: newPassword } });
      setNewUsername("");
      setNewPassword("");
      toast.success("OPDS credential created");
      void router.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create credential");
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (credentialId: string, isEnabled: boolean) => {
    await toggleOpdsCredentialServerFn({ data: { credentialId, isEnabled } });
    void router.invalidate();
  };

  const handleDelete = async (credentialId: string) => {
    await deleteOpdsCredentialServerFn({ data: { credentialId } });
    void router.invalidate();
  };

  useEffect(() => { setCatalogUrl(`${window.location.origin}/opds/catalog`); }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>OPDS Catalog</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950">
          <p className="text-sm font-medium">Catalog URL</p>
          <code className="mt-1 block break-all rounded bg-white p-2 text-xs dark:bg-gray-900" data-testid="opds-catalog-url">
            {catalogUrl}
          </code>
          <p className="mt-2 text-xs text-muted-foreground">
            Add this URL to KOReader or any OPDS reader. Use the credentials below to authenticate.
          </p>
        </div>

        {credentials.length === 0 && (
          <p className="text-sm text-muted-foreground">No OPDS credentials created yet.</p>
        )}

        {credentials.map((cred) => (
          <div key={cred.id} className="rounded-md border p-3" data-testid="opds-credential">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{cred.username}</p>
                <p className="text-sm text-muted-foreground">
                  <Badge variant={cred.isEnabled ? "default" : "secondary"}>
                    {cred.isEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                  <span className="ml-2">Created {formatDistanceToNow(new Date(cred.createdAt))} ago</span>
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { void handleToggle(cred.id, !cred.isEnabled); }}
                  data-testid="toggle-opds-credential-btn"
                >
                  {cred.isEnabled ? "Disable" : "Enable"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { void handleDelete(cred.id); }}
                  data-testid="delete-opds-credential-btn"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <Input
            placeholder="Username"
            value={newUsername}
            onChange={(e) => { setNewUsername(e.target.value); }}
            className="max-w-xs"
            data-testid="opds-username-input"
          />
          <Input
            type="password"
            placeholder="Password (min 8 chars)"
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); }}
            className="max-w-xs"
            data-testid="opds-password-input"
          />
          <Button
            onClick={() => { void handleAdd(); }}
            disabled={adding || !newUsername.trim() || newPassword.length < 8}
            data-testid="add-opds-credential-btn"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Credential"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function KoboDevicesTab({ devices, shelves }: { devices: KoboDeviceRow[]; shelves: ShelfRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState("");
  const [newDeviceToken, setNewDeviceToken] = useState<string | null>(null);
  const [shelfPickerDeviceId, setShelfPickerDeviceId] = useState<string | null>(null);

  const koboApiBaseUrl = "/kobo";

  const handleAddDevice = async () => {
    setAdding(true);
    try {
      const device = await addKoboDeviceServerFn({ data: { deviceName: newDeviceName } });
      setNewDeviceToken(device.authToken);
      setNewDeviceName("");
      void router.invalidate();
    } finally {
      setAdding(false);
    }
  };

  const handleRevoke = async (deviceId: string) => {
    await revokeKoboDeviceServerFn({ data: { deviceId } });
    void router.invalidate();
  };

  const handleRemoveDevice = async (deviceId: string) => {
    await removeKoboDeviceServerFn({ data: { deviceId } });
    void router.invalidate();
  };

  const handleToggleShelf = async (deviceId: string, shelfId: string, currentCollections: KoboDeviceRow["collections"]) => {
    const currentIds = currentCollections.map((c) => c.collection.id);
    const newIds = currentIds.includes(shelfId)
      ? currentIds.filter((id) => id !== shelfId)
      : [...currentIds, shelfId];
    await updateDeviceCollectionsServerFn({ data: { deviceId, collectionIds: newIds } });
    void router.invalidate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kobo Devices</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {devices.length === 0 && !newDeviceToken && (
          <p className="text-sm text-muted-foreground">No Kobo devices paired yet.</p>
        )}

        {devices.map((device) => (
          <div key={device.id} className="rounded-md border p-3" data-testid="kobo-device">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{device.deviceId}</p>
                <p className="text-sm text-muted-foreground">
                  Status: <Badge variant={device.status === "ACTIVE" ? "default" : "secondary"}>{device.status}</Badge>
                  {device.lastSyncAt && (
                    <span className="ml-2">Last sync: {formatDistanceToNow(new Date(device.lastSyncAt))} ago</span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                {device.status === "ACTIVE" && (
                  <Button variant="outline" size="sm" onClick={() => { setShelfPickerDeviceId(shelfPickerDeviceId === device.id ? null : device.id); }} data-testid="edit-shelves-btn">
                    <FolderOpen className="mr-1 h-4 w-4" />
                    Shelves
                  </Button>
                )}
                {device.status === "ACTIVE" && (
                  <Button variant="outline" size="sm" onClick={() => { void handleRevoke(device.id); }}>Revoke</Button>
                )}
                <Button variant="destructive" size="sm" onClick={() => { void handleRemoveDevice(device.id); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {device.collections.length > 0 && shelfPickerDeviceId !== device.id && (
              <p className="mt-1 text-sm text-muted-foreground">
                Syncing: {device.collections.map((c) => c.collection.name).join(", ")}
              </p>
            )}
            {shelfPickerDeviceId === device.id && (
              <div className="mt-3 space-y-1" data-testid="shelf-picker">
                <p className="text-sm font-medium">Select shelves to sync:</p>
                {shelves.length === 0 && (
                  <p className="text-sm text-muted-foreground">No shelves created yet.</p>
                )}
                {shelves.map((shelf) => {
                  const isSelected = device.collections.some((c) => c.collection.id === shelf.id);
                  return (
                    <Button
                      key={shelf.id}
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className={`mr-2 ${isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-60"}`}
                      onClick={() => { void handleToggleShelf(device.id, shelf.id, device.collections); }}
                      data-testid="shelf-toggle-btn"
                    >
                      {isSelected ? <Check className="mr-1 h-3 w-3" /> : <FolderOpen className="mr-1 h-3 w-3" />}
                      {shelf.name} ({shelf._count.items})
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {newDeviceToken && (
          <div className="rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950" data-testid="kobo-setup-url">
            <p className="text-sm font-medium">Device added! Configure your Kobo with this URL:</p>
            <code className="mt-2 block break-all rounded bg-white p-2 text-xs dark:bg-gray-900">
              {koboApiBaseUrl}/{newDeviceToken}
            </code>
            <p className="mt-2 text-xs text-muted-foreground">
              Set this as the API endpoint in your Kobo&apos;s configuration file.
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => { setNewDeviceToken(null); }}>
              Dismiss
            </Button>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            placeholder="Device name"
            value={newDeviceName}
            onChange={(e) => { setNewDeviceName(e.target.value); }}
            className="max-w-xs"
            data-testid="kobo-device-name-input"
          />
          <Button onClick={() => { void handleAddDevice(); }} disabled={adding || !newDeviceName.trim()} data-testid="add-kobo-device-btn">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Device"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

import { useState, useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  getSmtpConfigServerFn,
  saveSmtpConfigServerFn,
  removeSmtpConfigServerFn,
  testSmtpConnectionServerFn,
} from "~/lib/server-fns/smtp";

type SmtpSecurity = "tls" | "starttls" | "none";

interface SmtpConfigData {
  host: string;
  port: number;
  username: string;
  fromAddress: string;
  security: SmtpSecurity;
}

const SECURITY_LABELS: Record<SmtpSecurity, string> = {
  tls: "TLS",
  starttls: "STARTTLS",
  none: "None",
};

const SECURITY_PORTS: Record<SmtpSecurity, number> = {
  tls: 465,
  starttls: 587,
  none: 25,
};

export function SmtpConfigCard({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!configured);
  const [loading, setLoading] = useState(configured);
  const [loadError, setLoadError] = useState(false);
  const [config, setConfig] = useState<SmtpConfigData | null>(null);

  // Form state
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [security, setSecurity] = useState<SmtpSecurity>("starttls");
  const [saving, setSaving] = useState(false);

  // Test email state
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);

  // Removing state
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;

    async function loadConfig() {
      try {
        const result = await getSmtpConfigServerFn();
        if (cancelled) return;
        if (result.configured) {
          const data: SmtpConfigData = {
            host: result.host,
            port: result.port,
            username: result.username,
            fromAddress: result.fromAddress,
            security: result.security,
          };
          setConfig(data);
          setHost(data.host);
          setPort(String(data.port));
          setUsername(data.username);
          setFromAddress(data.fromAddress);
          setSecurity(data.security);
          setTestEmail(data.fromAddress);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadConfig();
    return () => { cancelled = true; };
  }, [configured]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveSmtpConfigServerFn({
        data: {
          host,
          port: Number(port),
          username,
          password,
          fromAddress,
          security,
        },
      });
      toast.success("SMTP configuration saved");
      setEditing(false);
      void router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save SMTP configuration");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await removeSmtpConfigServerFn();
      toast.success("SMTP configuration removed");
      void router.invalidate();
    } catch {
      toast.error("Failed to remove SMTP configuration");
    } finally {
      setRemoving(false);
    }
  }

  async function handleTestEmail() {
    setSending(true);
    try {
      const result = await testSmtpConnectionServerFn({
        data: { recipientEmail: testEmail },
      }) as { success: boolean; error?: string };
      if (result.success) {
        toast.success("Test email sent successfully");
      } else {
        toast.error(result.error ?? "Failed to send test email");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send test email");
    } finally {
      setSending(false);
    }
  }

  function handleSecurityChange(value: SmtpSecurity) {
    setSecurity(value);
    setPort(String(SECURITY_PORTS[value]));
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          Email (SMTP)
          <Badge variant={configured && !editing ? "default" : "secondary"}>
            {configured && !editing ? "Connected" : "Not configured"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Loading...
          </p>
        )}

        {loadError && (
          <p className="text-sm text-destructive">Failed to load configuration</p>
        )}

        {!loading && !loadError && editing && (
          <SmtpForm
            host={host}
            port={port}
            username={username}
            password={password}
            fromAddress={fromAddress}
            security={security}
            saving={saving}
            onHostChange={setHost}
            onPortChange={setPort}
            onUsernameChange={setUsername}
            onPasswordChange={setPassword}
            onFromAddressChange={setFromAddress}
            onSecurityChange={handleSecurityChange}
            onSave={() => { void handleSave(); }}
          />
        )}

        {!loading && !loadError && !editing && config && (
          <>
            <div className="space-y-1 text-sm">
              <div className="flex gap-4">
                <span className="text-muted-foreground">Server:</span>
                <span>{config.host}:{config.port}</span>
              </div>
              <div className="flex gap-4">
                <span className="text-muted-foreground">Username:</span>
                <span>{config.username}</span>
              </div>
              <div className="flex gap-4">
                <span className="text-muted-foreground">From:</span>
                <span>{config.fromAddress}</span>
              </div>
              <div className="flex gap-4">
                <span className="text-muted-foreground">Security:</span>
                <span>{SECURITY_LABELS[config.security]}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { setEditing(true); }}>
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { void handleRemove(); }}
                disabled={removing}
              >
                {removing ? "Removing..." : "Remove"}
              </Button>
            </div>

            <div className="border-t pt-3 space-y-2">
              <p className="text-sm font-medium">Test Connection</p>
              <div className="flex items-center gap-2">
                <Input
                  type="email"
                  value={testEmail}
                  onChange={(e) => { setTestEmail(e.target.value); }}
                  placeholder="recipient@example.com"
                  className="max-w-sm"
                />
                <Button
                  size="sm"
                  onClick={() => { void handleTestEmail(); }}
                  disabled={sending || !testEmail.trim()}
                >
                  {sending ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-1" />
                      Sending...
                    </>
                  ) : (
                    "Send Test Email"
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SmtpForm({
  host,
  port,
  username,
  password,
  fromAddress,
  security,
  saving,
  onHostChange,
  onPortChange,
  onUsernameChange,
  onPasswordChange,
  onFromAddressChange,
  onSecurityChange,
  onSave,
}: {
  host: string;
  port: string;
  username: string;
  password: string;
  fromAddress: string;
  security: SmtpSecurity;
  saving: boolean;
  onHostChange: (v: string) => void;
  onPortChange: (v: string) => void;
  onUsernameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onFromAddressChange: (v: string) => void;
  onSecurityChange: (v: SmtpSecurity) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Host</label>
          <Input
            value={host}
            onChange={(e) => { onHostChange(e.target.value); }}
            placeholder="smtp.example.com"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Port</label>
          <Input
            type="number"
            value={port}
            onChange={(e) => { onPortChange(e.target.value); }}
            placeholder="587"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Username</label>
          <Input
            value={username}
            onChange={(e) => { onUsernameChange(e.target.value); }}
            placeholder="Username"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Password</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => { onPasswordChange(e.target.value); }}
            placeholder="Password"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">From Address</label>
          <Input
            type="email"
            value={fromAddress}
            onChange={(e) => { onFromAddressChange(e.target.value); }}
            placeholder="sender@example.com"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Security</label>
          <div className="inline-flex items-center rounded-lg border bg-muted p-1" role="radiogroup" aria-label="Security">
            {(["starttls", "tls", "none"] as const).map((opt) => (
              <Button
                key={opt}
                type="button"
                variant={security === opt ? "default" : "ghost"}
                size="sm"
                role="radio"
                aria-checked={security === opt}
                onClick={() => { onSecurityChange(opt); }}
                className={security === opt ? "" : "text-muted-foreground"}
              >
                {SECURITY_LABELS[opt]}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <Button onClick={onSave} disabled={saving || !host.trim() || !username.trim() || !password.trim() || !fromAddress.trim()}>
        {saving ? (
          <>
            <Loader2 className="size-4 animate-spin mr-1" />
            Saving...
          </>
        ) : (
          "Save Configuration"
        )}
      </Button>
    </div>
  );
}

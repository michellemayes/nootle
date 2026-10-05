import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useDictionary, parseVariants } from "@/hooks/useDictionary";
import { Pencil, Plus, Trash2 } from "lucide-react";

const AUTO_LEARN_SETTING = "dictionary_auto_learn";

export function DictionaryManager() {
  const { entries, error, addEntry, updateEntry, deleteEntry } = useDictionary();
  const [autoLearn, setAutoLearn] = useState(true);
  const [newTerm, setNewTerm] = useState("");
  const [newVariants, setNewVariants] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTerm, setEditTerm] = useState("");
  const [editVariants, setEditVariants] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    invoke<string | null>("get_app_setting", { key: AUTO_LEARN_SETTING })
      .then((v) => setAutoLearn(v !== "false"))
      .catch(() => {});
  }, []);

  const toggleAutoLearn = async (enabled: boolean) => {
    setAutoLearn(enabled);
    await invoke("set_app_setting", { key: AUTO_LEARN_SETTING, value: String(enabled) });
  };

  const run = async (action: () => Promise<void>) => {
    try {
      setActionError(null);
      await action();
      return true;
    } catch (err) {
      setActionError(String(err));
      return false;
    }
  };

  const handleAdd = async () => {
    if (!newTerm.trim()) return;
    if (await run(() => addEntry(newTerm, parseVariants(newVariants)))) {
      setNewTerm("");
      setNewVariants("");
    }
  };

  const handleSaveEdit = async (id: string) => {
    if (await run(() => updateEntry(id, editTerm, parseVariants(editVariants)))) {
      setEditingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dictionary</CardTitle>
        <CardDescription>
          Names and jargon the transcriber gets wrong. Misheard variants are corrected as you
          record, and every term is passed to the AI as a spelling reference.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Learn from transcript edits</p>
            <p className="text-sm text-muted-foreground">
              When you fix a word in a transcript, remember the fix for future meetings
            </p>
          </div>
          <Switch
            checked={autoLearn}
            onCheckedChange={toggleAutoLearn}
            aria-label="Learn from transcript edits"
          />
        </div>

        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd();
          }}
        >
          <Input
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            className="h-8 w-44"
            placeholder="Correct spelling"
            aria-label="Correct spelling"
          />
          <Input
            value={newVariants}
            onChange={(e) => setNewVariants(e.target.value)}
            className="h-8 flex-1 min-w-48"
            placeholder="Misheard as (comma-separated, optional)"
            aria-label="Misheard as"
          />
          <Button type="submit" size="sm" disabled={!newTerm.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </form>

        {(actionError || error) && (
          <p className="text-sm text-destructive">{actionError ?? error}</p>
        )}

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No words yet. Add one above, or fix a word in any transcript and Nootle will learn it.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {entries.map((entry) =>
              editingId === entry.id ? (
                <div key={entry.id} className="flex flex-wrap items-center gap-2 p-3">
                  <Input
                    value={editTerm}
                    onChange={(e) => setEditTerm(e.target.value)}
                    className="h-8 w-44"
                    aria-label="Correct spelling"
                  />
                  <Input
                    value={editVariants}
                    onChange={(e) => setEditVariants(e.target.value)}
                    className="h-8 flex-1 min-w-48"
                    placeholder="Misheard as (comma-separated)"
                    aria-label="Misheard as"
                  />
                  <Button size="sm" onClick={() => handleSaveEdit(entry.id)}>Save</Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div key={entry.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{entry.term}</span>
                      {entry.source === "learned" && (
                        <Badge variant="secondary" size="sm">Learned</Badge>
                      )}
                    </div>
                    {entry.misheard.length > 0 && (
                      <p className="truncate text-xs text-muted-foreground">
                        Fixes: {entry.misheard.join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setEditingId(entry.id);
                        setEditTerm(entry.term);
                        setEditVariants(entry.misheard.join(", "));
                      }}
                      title="Edit"
                      aria-label={`Edit ${entry.term}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => run(() => deleteEntry(entry.id))}
                      title="Delete"
                      aria-label={`Delete ${entry.term}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

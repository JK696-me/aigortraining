import { User, Bell, Scale, Moon, Info, LogOut, ChevronRight, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Layout } from "@/components/Layout";

const settingsGroups = [
  {
    title: "Profile",
    items: [
      { icon: User, label: "Account", value: null, type: "link" },
      { icon: Scale, label: "Weight Unit", value: "kg", type: "link" },
    ],
  },
  {
    title: "Preferences",
    items: [
      { icon: Bell, label: "Notifications", value: true, type: "toggle" },
      { icon: Moon, label: "Dark Mode", value: true, type: "toggle" },
    ],
  },
  {
    title: "About",
    items: [
      { icon: Info, label: "About AIgor", value: null, type: "link" },
    ],
  },
];

export default function Settings() {
  return (
    <Layout>
      <div className="px-4 pt-12 safe-top">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          </div>
          <p className="text-muted-foreground">Customize your experience</p>
        </div>

        {/* User Card */}
        <Card className="p-4 bg-card border-border mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground">Guest User</h3>
              <p className="text-sm text-muted-foreground">Tap to sign in</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </Card>

        {/* Settings Groups */}
        <div className="space-y-6">
          {settingsGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">
                {group.title}
              </h3>
              <Card className="bg-card border-border overflow-hidden">
                {group.items.map((item, idx) => (
                  <div
                    key={item.label}
                    className={`flex items-center justify-between p-4 ${
                      idx !== group.items.length - 1 ? "border-b border-border" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium text-foreground">{item.label}</span>
                    </div>
                    {item.type === "toggle" ? (
                      <Switch defaultChecked={item.value as boolean} />
                    ) : item.type === "link" ? (
                      <div className="flex items-center gap-2">
                        {item.value && (
                          <span className="text-sm text-muted-foreground">{item.value}</span>
                        )}
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    ) : null}
                  </div>
                ))}
              </Card>
            </div>
          ))}
        </div>

        {/* Logout */}
        <Card className="mt-6 bg-card border-border overflow-hidden">
          <button className="flex items-center gap-3 p-4 w-full text-destructive">
            <LogOut className="h-5 w-5" />
            <span className="font-medium">Sign Out</span>
          </button>
        </Card>

        {/* Version */}
        <p className="text-center text-xs text-muted-foreground mt-8">
          AIgor Training v1.0.0
        </p>
      </div>
    </Layout>
  );
}

"use client";

import { useCallback, useState } from "react";
import TaskCapture from "./task-capture";
import TaskList from "./task-list";

/**
 * Regroupe la capture et la liste des tâches. Possède le seul state partagé
 * (refreshKey) permettant à TaskList de se recharger après une création,
 * sans que page.tsx (Server Component) n'ait à connaître cet état.
 */
export default function DashboardTasks() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleTasksChanged = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  return (
    <div className="space-y-8">
      <TaskCapture onTaskCreated={handleTasksChanged} />
      <TaskList refreshKey={refreshKey} onTaskUpdated={handleTasksChanged} />
    </div>
  );
}

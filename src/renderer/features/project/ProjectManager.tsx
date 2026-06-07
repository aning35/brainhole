import { t } from 'i18next';
import React, { useState } from 'react';
import { Project } from '../../types';
import { useCanvasStore } from '../../stores/canvasStore';
import { useToast } from '../../hooks/useToast';

interface ProjectManagerProps {
  onProjectLoad?: (project: Project) => void;
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({ onProjectLoad }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isNewProjectDialogOpen, setIsNewProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');

  const { nodes, edges, currentProject, setCurrentProject } = useCanvasStore();
  const { toast } = useToast();

  // Create new project
  const createNewProject = () => {
    if (!newProjectName.trim()) {
      toast({
        type: 'error',
        title: t('project.error'),
        description: t('project.enterName'),
      });
      return;
    }

    const newProject: Project = {
      id: Date.now().toString(),
      name: newProjectName.trim(),
      description: newProjectDescription.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      canvasData: {
        nodes: [],
        edges: [],
      },
    };

    setProjects(prev => [...prev, newProject]);
    setCurrentProject(newProject);
    setIsNewProjectDialogOpen(false);
    setNewProjectName('');
    setNewProjectDescription('');

    toast({
      type: 'success',
      title: t('project.success'),
      description: t('project.created', { name: newProject.name }),
    });

    onProjectLoad?.(newProject);
  };

  // Save current project
  const saveCurrentProject = () => {
    if (!currentProject) {
      toast({
        type: 'error',
        title: t('project.error'),
        description: t('project.noOpen'),
      });
      return;
    }

    const updatedProject: Project = {
      ...currentProject,
      updatedAt: Date.now(),
      canvasData: {
        nodes,
        edges,
      },
    };

    setProjects(prev =>
      prev.map(p => p.id === currentProject.id ? updatedProject : p)
    );
    setCurrentProject(updatedProject);

    toast({
      type: 'success',
      title: t('project.success'),
      description: t('project.saved'),
    });
  };

  // Load project
  const loadProject = (project: Project) => {
    setCurrentProject(project);
    onProjectLoad?.(project);

    toast({
      type: 'success',
      title: t('project.success'),
      description: t('project.loaded', { name: project.name }),
    });
  };

  // Delete project
  const deleteProject = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    if (confirm(t('project.confirmDelete', { name: project.name }))) {
      setProjects(prev => prev.filter(p => p.id !== projectId));

      if (currentProject?.id === projectId) {
        setCurrentProject(null);
      }

      toast({
        type: 'success',
        title: t('project.success'),
        description: t('project.deleted', { name: project.name }),
      });
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{t('project.management')}</h2>
        <div className="space-x-2">
          <button
            onClick={() => setIsNewProjectDialogOpen(true)}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            新建项目
          </button>
          {currentProject && (
            <button
              onClick={saveCurrentProject}
              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
            >
              保存项目
            </button>
          )}
        </div>
      </div>

      {/* Current project info */}
      {currentProject && (
        <div className="bg-blue-50 p-3 rounded-lg mb-4">
          <div className="font-medium text-blue-900">{currentProject.name}</div>
          {currentProject.description && (
            <div className="text-sm text-blue-700 mt-1">{currentProject.description}</div>
          )}
          <div className="text-xs text-blue-600 mt-2">
            {t('project.createdAt', { time: new Date(currentProject.createdAt).toLocaleString() })}
          </div>
        </div>
      )}

      {/* Project list */}
      <div className="space-y-2">
        <h3 className="font-medium text-gray-700">{t('project.list')}</h3>
        {projects.length === 0 ? (
          <div className="text-gray-500 text-sm py-8 text-center">
            暂无项目，点击&quot;新建项目&quot;开始
          </div>
        ) : (
          projects.map(project => (
            <div key={project.id} className="border rounded-lg p-3 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium">{project.name}</div>
                  {project.description && (
                    <div className="text-sm text-gray-600">{project.description}</div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    {t('project.updatedAt', { time: new Date(project.updatedAt).toLocaleString() })}
                  </div>
                </div>
                <div className="space-x-2">
                  <button
                    onClick={() => loadProject(project)}
                    className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                    disabled={currentProject?.id === project.id}
                  >
                    {currentProject?.id === project.id ? t('project.current') : t('project.load')}
                  </button>
                  <button
                    onClick={() => deleteProject(project.id)}
                    className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New project dialog */}
      {isNewProjectDialogOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">{t('project.new')}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('project.nameLabel')}</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t('project.namePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('project.descLabel')}</label>
                <textarea
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder={t('project.descPlaceholder')}
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={() => {
                  setIsNewProjectDialogOpen(false);
                  setNewProjectName('');
                  setNewProjectDescription('');
                }}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={createNewProject}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 
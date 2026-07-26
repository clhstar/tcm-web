import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { MaterialIcon } from "../../components/MaterialIcon";
import type { Consultation } from "../../api/consultation";

type ConversationActionsInput = {
  consultation: Consultation;
  title: string;
  onRename: (id: number, title: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  children: (props: ConversationActionsRenderProps) => ReactNode;
};

type ConversationActionsRenderProps = {
  setTriggerElement: (element: HTMLButtonElement | null) => void;
  openFromButton: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  openFromContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
};

type MenuPosition = {
  x: number;
  y: number;
};

export function ConversationActions({
  consultation,
  title,
  onRename,
  onDelete,
  children,
}: ConversationActionsInput) {
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [renameDraft, setRenameDraft] = useState(title);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [triggerElement, setTriggerElement] =
    useState<HTMLButtonElement | null>(null);
  const [menuElement, setMenuElement] = useState<HTMLDivElement | null>(null);
  const [renameInputElement, setRenameInputElement] =
    useState<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!menuPosition) return;
    function closeAnchoredUi() {
      setMenuPosition(null);
    }
    function closeMenu(event: MouseEvent) {
      const target = event.target as Node;
      if (menuElement?.contains(target) || triggerElement?.contains(target))
        return;
      setMenuPosition(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuPosition(null);
    }
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeAnchoredUi);
    window.addEventListener("scroll", closeAnchoredUi, true);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeAnchoredUi);
      window.removeEventListener("scroll", closeAnchoredUi, true);
    };
  }, [menuElement, menuPosition, triggerElement]);

  useEffect(() => {
    if (!isRenameOpen) return;
    renameInputElement?.focus();
    renameInputElement?.select();
  }, [isRenameOpen, renameInputElement]);

  function openFromButton(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuPosition(clampMenuPosition(rect.left, rect.bottom + 6));
  }

  function openFromContextMenu(event: ReactMouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setMenuPosition(clampMenuPosition(event.clientX, event.clientY));
  }

  function openRename() {
    setMenuPosition(null);
    setErrorMessage("");
    setRenameDraft(title);
    setIsRenameOpen(true);
  }

  function openDelete() {
    setMenuPosition(null);
    setErrorMessage("");
    setIsDeleteOpen(true);
  }

  async function submitRename() {
    const normalizedTitle = renameDraft.trim();
    if (!normalizedTitle) {
      setErrorMessage("对话名称不能为空。");
      return;
    }
    setIsWorking(true);
    setErrorMessage("");
    try {
      if (normalizedTitle !== title.trim()) {
        await onRename(consultation.id, normalizedTitle);
      }
      setIsRenameOpen(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "重命名失败，请稍后重试。"
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function submitDelete() {
    setIsWorking(true);
    setErrorMessage("");
    try {
      await onDelete(consultation.id);
      setIsDeleteOpen(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "删除失败，请稍后重试。"
      );
    } finally {
      setIsWorking(false);
    }
  }

  const actions = (
    <>
      {menuPosition
        ? portal(
            <div
              ref={setMenuElement}
              className="conversation-action-menu"
              role="menu"
              aria-label="对话菜单"
              style={{ left: menuPosition.x, top: menuPosition.y }}
            >
              <button type="button" role="menuitem" onClick={openRename}>
                <MaterialIcon name="edit" />
                <span>重命名对话</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={openDelete}
              >
                <MaterialIcon name="delete" />
                <span>删除对话</span>
              </button>
            </div>
          )
        : null}

      {isRenameOpen
        ? portal(
            <ConversationActionDialog
              title="重命名对话"
              onClose={() => setIsRenameOpen(false)}
            >
              <form
                className="conversation-action-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitRename();
                }}
              >
                <input
                  ref={setRenameInputElement}
                  id={`conversation-rename-${consultation.id}`}
                  value={renameDraft}
                  maxLength={128}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  disabled={isWorking}
                />
                {errorMessage ? <p role="alert">{errorMessage}</p> : null}
                <div className="conversation-action-dialog-actions">
                  <button
                    type="button"
                    onClick={() => setIsRenameOpen(false)}
                    disabled={isWorking}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="primary"
                    disabled={isWorking}
                  >
                    {isWorking ? "保存中..." : "保存"}
                  </button>
                </div>
              </form>
            </ConversationActionDialog>
          )
        : null}

      {isDeleteOpen
        ? portal(
            <ConversationActionDialog
              title="删除对话"
              onClose={() => setIsDeleteOpen(false)}
            >
              <div className="conversation-action-form">
                <p>删除后，这条对话将从对话记录中移除。</p>
                {errorMessage ? <p role="alert">{errorMessage}</p> : null}
                <div className="conversation-action-dialog-actions">
                  <button
                    type="button"
                    onClick={() => setIsDeleteOpen(false)}
                    disabled={isWorking}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => void submitDelete()}
                    disabled={isWorking}
                  >
                    {isWorking ? "删除中..." : "删除"}
                  </button>
                </div>
              </div>
            </ConversationActionDialog>
          )
        : null}
    </>
  );

  return (
    <>
      {children({ setTriggerElement, openFromButton, openFromContextMenu })}
      {actions}
    </>
  );
}

function ConversationActionDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="conversation-action-dialog-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="conversation-action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversation-action-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="conversation-action-dialog-title">{title}</h2>
          <button type="button" aria-label="关闭" onClick={onClose}>
            <MaterialIcon name="close" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function portal(children: ReactNode) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

function clampMenuPosition(x: number, y: number): MenuPosition {
  if (typeof window === "undefined") return { x, y };
  const menuWidth = 184;
  const menuHeight = 92;
  const margin = 8;
  return {
    x: Math.min(Math.max(margin, x), window.innerWidth - menuWidth - margin),
    y: Math.min(Math.max(margin, y), window.innerHeight - menuHeight - margin),
  };
}

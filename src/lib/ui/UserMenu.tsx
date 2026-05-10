import { Link } from "@tanstack/react-router";
import { Menu, MenuItem, MenuTrigger, Popover, Button as RACButton } from "react-aria-components";
import { supabase } from "../../api/supabase";
import { useSession } from "../../auth/useSession";
import styles from "./UserMenu.module.css";

function initialFor(email: string | null | undefined): string {
  const trimmed = (email ?? "").trim();
  if (!trimmed) return "?";
  return trimmed[0]?.toUpperCase() ?? "?";
}

export function UserMenu() {
  const session = useSession();

  if (session.status === "loading") return null;

  const signInLink = (
    <Link to="/login" className={styles.signInLink}>
      Sign in
    </Link>
  );

  if (session.status === "unauthenticated") return signInLink;
  if (session.user.is_anonymous) return signInLink;

  const email = session.user.email ?? "";

  return (
    <MenuTrigger>
      <RACButton aria-label={`Account menu for ${email}`} className={styles.trigger}>
        <span aria-hidden="true">{initialFor(email)}</span>
      </RACButton>
      <Popover className={styles.popover} placement="bottom end">
        <div className={styles.email}>{email}</div>
        <Menu className={styles.menu}>
          <MenuItem
            className={styles.menuItem}
            onAction={() => {
              void supabase.auth.signOut();
            }}
          >
            Sign out
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

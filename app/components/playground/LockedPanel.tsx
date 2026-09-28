import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Button } from "@hdruk/ui";
import FindInPageIcon from "@mui/icons-material/FindInPage";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

export function LockedPanel({ message, onAction, actionLabel }: { message: string; onAction?: () => void; actionLabel?: string }) {
  return (
    <Box sx={{ height: "100%", bgcolor: "background.default", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, p: 3 }}>
      <LockOutlinedIcon sx={{ fontSize: 36, color: "text.disabled" }} />
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", maxWidth: 340 }}>
        {message}
      </Typography>
      {onAction && actionLabel && (
        <Button size="small" variant="outlined" startIcon={<FindInPageIcon />} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}

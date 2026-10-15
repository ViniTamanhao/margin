// Exit codes are a narrow protocol with src/main/rename-no-replace.ts.
// Never fall back to ordinary rename: that would reintroduce destination loss.
#if defined(__linux__)
#define _GNU_SOURCE
#include <fcntl.h>
#include <sys/syscall.h>
#include <unistd.h>
#elif defined(__APPLE__)
// renamex_np is declared by stdio.h below.
#elif defined(_WIN32)
#include <windows.h>
#include <shellapi.h>
#else
#error Unsupported platform: an atomic no-replace rename is required
#endif

#include <errno.h>
#include <stdio.h>

int main(int argc, char **argv) {
#if defined(_WIN32)
  // Use the original UTF-16 command line, including non-ASCII workspace paths.
  int count;
  LPWSTR *args = CommandLineToArgvW(GetCommandLineW(), &count);
  if (!args) return 1;
  if (count != 3) { LocalFree(args); return 64; }
  BOOL moved = MoveFileExW(args[1], args[2], 0);
  DWORD error = moved ? ERROR_SUCCESS : GetLastError();
  // Windows may report ACCESS_DENIED for a directory/type collision. This
  // post-failure check only classifies the error; it never authorizes a retry.
  BOOL collision = !moved && GetFileAttributesW(args[2]) != INVALID_FILE_ATTRIBUTES;
  LocalFree(args);
  (void)argc;
  (void)argv;
  if (moved) return 0;
  if (collision || error == ERROR_ALREADY_EXISTS || error == ERROR_FILE_EXISTS) return 2;
  if (error == ERROR_FILE_NOT_FOUND || error == ERROR_PATH_NOT_FOUND) return 3;
  if (error == ERROR_NOT_SUPPORTED || error == ERROR_INVALID_FUNCTION) return 4;
  fprintf(stderr, "MoveFileExW failed: %lu\n", (unsigned long)error);
#else
  if (argc != 3) return 64;
#if defined(__linux__)
  // Use the syscall directly so building does not require glibc's newer wrapper.
  int moved = syscall(SYS_renameat2, AT_FDCWD, argv[1], AT_FDCWD, argv[2], 1 /* RENAME_NOREPLACE */);
#else
  int moved = renamex_np(argv[1], argv[2], RENAME_EXCL);
#endif
  if (moved == 0) return 0;
  int error = errno;
  if (error == EEXIST || error == ENOTEMPTY) return 2;
  if (error == ENOENT || error == ENOTDIR) return 3;
  if (error == ENOSYS || error == EINVAL || error == ENOTSUP) return 4;
  fprintf(stderr, "Exclusive rename failed: %d\n", error);
#endif
  return 1;
}

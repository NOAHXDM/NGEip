import { inject } from '@angular/core';
import { Auth, authState, User } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CanActivateFn, RedirectCommand, Router, UrlTree } from '@angular/router';
import { from, switchMap, map, Observable } from 'rxjs';

/**
 * adminGuard：限制 admin/* 路由僅管理者（role === 'admin'）可進入
 * 非管理者重導至首頁並顯示「權限不足」提示
 */
export const adminGuard: CanActivateFn = (route, state) => {
  const auth = inject(Auth);
  const firestore = inject(Firestore);
  const router: Router = inject(Router);
  const snackBar = inject(MatSnackBar);
  const homeUrl: UrlTree = router.parseUrl('/');

  const authState$: Observable<User | null> = authState(auth);

  return authState$.pipe(
    switchMap((user) => {
      if (!user) {
        snackBar.open('權限不足，無法存取此頁面', '關閉', { duration: 3000 });
        return from(Promise.resolve(new RedirectCommand(homeUrl)));
      }
      const userDoc = doc(firestore, `users/${user.uid}`);
      return from(getDoc(userDoc)).pipe(
        map((snap) => {
          if (snap.exists() && snap.data()['role'] === 'admin') {
            return true;
          }
          snackBar.open('權限不足，無法存取此頁面', '關閉', { duration: 3000 });
          return new RedirectCommand(homeUrl);
        })
      );
    })
  );
};

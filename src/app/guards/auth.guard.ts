import { inject } from '@angular/core';
import { Auth, authState, User } from '@angular/fire/auth';
import { CanActivateFn, RedirectCommand, Router, UrlTree } from '@angular/router';
import { map, Observable } from 'rxjs';

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(Auth);
  const authState$: Observable<User | null> = authState(auth);
  const router: Router = inject(Router);
  const urlTree: UrlTree = router.parseUrl('/Login');
  return authState$.pipe(
    map((user) => {
      if (!user) {
        return new RedirectCommand(urlTree);
      }

      return true;
    })
  );
};

export const noAuthGuard: CanActivateFn = (route, state) => {
  const auth = inject(Auth);
  const authState$: Observable<User | null> = authState(auth);
  const router: Router = inject(Router);
  const urlTree: UrlTree = router.parseUrl('/');
  return authState$.pipe(
    map((user) => {
      if (!!user) {
        return new RedirectCommand(urlTree);
      }

      return true;
    })
  );
};
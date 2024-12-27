import { CanActivateFn } from '@angular/router';

export const yourGuardGuard: CanActivateFn = (route, state) => {
  const Username = localStorage.getItem('Username');
  // if (!Username) {
  //   return false;
  // }
  // return true;
  // falsy value
  return !!Username;
};

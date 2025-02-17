import { Pipe, PipeTransform } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReplaySubject } from 'rxjs';

import { UserService } from '../services/user.service';

@Pipe({
  name: 'userName',
  standalone: true,
  pure: false,
})
export class UserNamePipe implements PipeTransform {
  readonly latestMapping$ = new ReplaySubject<boolean>(1);
  private latestMapping: Map<string, string> = new Map();

  constructor(private userService: UserService) {
    this.userService.list$.pipe(takeUntilDestroyed()).subscribe({
      next: (users) => {
        this.latestMapping$.next(true);
        this.latestMapping = new Map(
          users.map((user) => [user.uid!, user.name])
        );
      },
    });
  }

  transform(value: string): string {
    return this.latestMapping.get(value) || '-';
  }
}

import { Pipe, PipeTransform } from '@angular/core';
import { User, UserService } from '../services/user.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';

@Pipe({
  name: 'userName',
  standalone: true,
  pure: false,
})
export class UserNamePipe implements PipeTransform {
  private latestMapping: Map<string, string> = new Map();

  constructor(private userService: UserService) {
    this.userService.list$.pipe(takeUntilDestroyed()).subscribe({
      next: (users) => {
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

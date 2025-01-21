import { Component, Input } from '@angular/core';
import { UserService, User } from '../services/user.service';
import { tap } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-avatar',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './avatar.component.html',
  styleUrl: './avatar.component.scss',
})
export class AvatarComponent {
  @Input() user!: User;
}

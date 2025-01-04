import { Component } from '@angular/core';

@Component({
  selector: 'app-avatar',
  standalone: true,
  imports: [],
  templateUrl: './avatar.component.html',
  styleUrl: './avatar.component.scss',
})
export class AvatarComponent {
  name: string = 'example'; // 初始化名字
  email: string = 'example@gmail.com'; // 初始化邮箱
}

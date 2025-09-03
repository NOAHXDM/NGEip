import { Directive, ElementRef, Input, OnChanges, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appLineThrough]',
  standalone: true
})
export class LineThroughDirective implements OnChanges {
  @Input('appLineThrough') isLineThrough:any = false;

  constructor(private el: ElementRef, private renderer: Renderer2) { }

  ngOnChanges() {
    if (!!this.isLineThrough) {
      this.renderer.addClass(this.el.nativeElement, 'text-decoration-line-through');
    } else {
      this.renderer.removeClass(this.el.nativeElement, 'text-decoration-line-through');
    }
  }

}

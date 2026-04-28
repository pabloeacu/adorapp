import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/registerSW', () => ({
  applyUpdate: vi.fn(),
}));

import { UpdateBanner } from './UpdateBanner';
import { applyUpdate } from '../lib/registerSW';

describe('<UpdateBanner />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is hidden by default', () => {
    render(<UpdateBanner />);
    expect(screen.queryByText(/Hay una nueva versión/i)).toBeNull();
  });

  it('appears when the sw-update-available event fires', async () => {
    render(<UpdateBanner />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent('adorapp:sw-update-available'));
    });
    expect(screen.getByText(/Hay una nueva versión/i)).toBeInTheDocument();
  });

  it('clicking "Actualizar" calls applyUpdate', async () => {
    const user = userEvent.setup();
    render(<UpdateBanner />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent('adorapp:sw-update-available'));
    });
    await user.click(screen.getByRole('button', { name: /Actualizar/i }));
    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('clicking the dismiss button hides the banner', async () => {
    const user = userEvent.setup();
    render(<UpdateBanner />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent('adorapp:sw-update-available'));
    });
    await user.click(screen.getByRole('button', { name: /Descartar/i }));
    expect(screen.queryByText(/Hay una nueva versión/i)).toBeNull();
  });
});

import React, { useState, useEffect } from 'react';
import { Mail, Lock, Eye, EyeOff, Loader2, UserPlus, CheckCircle } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useNavigate, Navigate } from 'react-router-dom';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { INSTRUMENTS, MEMBER_ROLES } from '../stores/appStore';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const login = useAuthStore((state) => state.login);
  const loading = useAuthStore((state) => state.loading);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);
  const user = useAuthStore((state) => state.user);

  const navigate = useNavigate();

  // Load saved credentials if "remember me" was checked
  // SECURITY FIX: Only remember email, NEVER password
  useEffect(() => {
    // Clear any leaked password from localStorage (legacy data)
    localStorage.removeItem('rememberedPassword');

    const savedEmail = localStorage.getItem('rememberedEmail');
    const savedRemember = localStorage.getItem('rememberMe') === 'true';

    if (savedRemember && savedEmail) {
      setEmail(savedEmail);
      // Password should NEVER be stored - user must re-enter it
      setRememberMe(true);
    }
  }, []);

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();

    if (!email || !password) {
      return;
    }

    // Save credentials if "remember me" is checked
    // SECURITY FIX: Only remember email, NEVER password
    if (rememberMe) {
      localStorage.setItem('rememberedEmail', email);
      // NEVER store password - security risk
      localStorage.setItem('rememberMe', 'true');
    } else {
      // Clear saved credentials if not checked
      localStorage.removeItem('rememberedEmail');
      localStorage.setItem('rememberMe', 'false');
    }

    const success = await login(email, password);
    if (success) {
      navigate('/');
    }
  };

  const handleOpenRegister = () => {
    setShowRegisterModal(true);
  };

  const handleRegistrationSuccess = () => {
    setShowRegisterModal(false);
    setShowSuccessModal(true);
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="AdorAPP Logo"
            className="w-24 h-24 rounded-2xl mx-auto mb-4 object-contain"
          />
          <h1 className="text-3xl font-bold tracking-tight">AdorAPP</h1>
          <p className="text-gray-500 mt-2">La plataforma de Adoración CAF</p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8">
          <h2 className="text-xl font-semibold mb-6 text-center">Iniciar Sesión</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-white transition-colors"
                autoComplete="username"
                disabled={loading}
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-12 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-white transition-colors"
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                disabled={loading}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {/* Remember Me Switch */}
            <div className="flex items-center justify-between py-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-11 h-6 rounded-full transition-colors ${rememberMe ? 'bg-white' : 'bg-neutral-700'}`}>
                    <div className={`w-5 h-5 bg-black rounded-full shadow-md transform transition-transform mt-0.5 ${rememberMe ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} />
                  </div>
                </div>
                <span className="text-sm text-gray-400">Recordar mi email</span>
              </label>
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-gray-200 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={18} className="animate-spin" />}
              {loading ? 'Iniciando sesión...' : 'Entrar'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-neutral-800">
            <p className="text-xs text-gray-500 text-center">
              Usa las credenciales que te proporcionaron tus pastores
            </p>
          </div>

          {/* Register Button */}
          <div className="mt-4">
            <button
              onClick={handleOpenRegister}
              className="w-full py-3 border border-neutral-700 text-gray-300 font-medium rounded-xl hover:bg-neutral-800 hover:border-neutral-600 transition-all flex items-center justify-center gap-2"
            >
              <UserPlus size={18} />
              Quiero registrarme
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-600 text-center mt-6">
          © 2026 Centro de Avivamiento Familiar
        </p>
      </div>

      {/* Registration Modal */}
      <RegisterModal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        onSuccess={handleRegistrationSuccess}
      />

      {/* Success Modal */}
      <Modal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        title="Solicitud Enviada"
        size="md"
      >
        <div className="text-center space-y-4 py-4">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle size={40} className="text-green-400" />
          </div>
          <h3 className="text-xl font-semibold">¡Solicitud enviada!</h3>
          <p className="text-gray-400">
            Los pastores del área revisarán tu solicitud para otorgarte las credenciales de acceso.
          </p>
          <p className="text-gray-500 text-sm">
            Si más tarde aún no se habilitó tu usuario, avisales a los pastores.
          </p>
          <Button onClick={() => setShowSuccessModal(false)} className="w-full mt-4">
            Entendido
          </Button>
        </div>
      </Modal>
    </div>
  );
};

// Registration Modal Component
const RegisterModal = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    birthdate: '',
    pastor_area: '',
    leader_of: '',
    instruments: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const toggleInstrument = (inst) => {
    setFormData(prev => ({
      ...prev,
      instruments: prev.instruments.includes(inst)
        ? prev.instruments.filter(i => i !== inst)
        : [...prev.instruments, inst]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validations
    if (!formData.name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    if (!formData.email.trim()) {
      setError('El email es obligatorio');
      return;
    }
    if (!formData.password) {
      setError('La contraseña es obligatoria');
      return;
    }
    if (formData.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);

    try {
      const { supabaseAdmin } = await import('../lib/supabase');

      // Check if email already exists in members or pending_registrations
      const { data: existingMember } = await supabaseAdmin
        .from('members')
        .select('id')
        .eq('email', formData.email.trim())
        .single();

      if (existingMember) {
        setError('Este email ya está registrado. Contactá a los pastores.');
        setLoading(false);
        return;
      }

      // Create pending registration
      const { error: insertError } = await supabaseAdmin
        .from('pending_registrations')
        .insert({
          name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
          phone: formData.phone.trim() || null,
          birthdate: formData.birthdate || null,
          pastor_area: formData.pastor_area.trim() || null,
          leader_of: formData.leader_of.trim() || null,
          instruments: formData.instruments,
          password_hash: formData.password, // Will be hashed by trigger
          status: 'pending',
        });

      if (insertError) {
        console.error('Registration error:', insertError);
        setError('No se pudo enviar la solicitud. Intentá de nuevo.');
        setLoading(false);
        return;
      }

      onSuccess();
    } catch (err) {
      console.error('Registration error:', err);
      setError('Ocurrió un error. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Solicitar Registro"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="text-sm text-gray-400 mb-4 p-3 bg-neutral-800/50 rounded-lg">
          Completá tus datos. Los campos marcados con * son obligatorios. Un pastor revisará tu solicitud.
        </div>

        <Input
          label="Nombre Completo *"
          name="name"
          placeholder="Tu nombre completo"
          value={formData.name}
          onChange={handleChange}
          required
        />

        <Input
          label="Email *"
          name="email"
          type="email"
          placeholder="tu@email.com"
          value={formData.email}
          onChange={handleChange}
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <div className="relative">
            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-2">
              Contraseña *
            </label>
            <Lock className="absolute left-4 top-[42px] text-gray-500" size={18} />
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              placeholder="Mínimo 6 caracteres"
              value={formData.password}
              onChange={handleChange}
              className="w-full pl-12 pr-12 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-white transition-colors"
              required
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-[42px] text-gray-500 hover:text-white"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div className="relative">
            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-2">
              Confirmar Contraseña *
            </label>
            <Lock className="absolute left-4 top-[42px] text-gray-500" size={18} />
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              name="confirmPassword"
              placeholder="Repetí la contraseña"
              value={formData.confirmPassword}
              onChange={handleChange}
              className="w-full pl-12 pr-12 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-white transition-colors"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-4 top-[42px] text-gray-500 hover:text-white"
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <Input
          label="Teléfono"
          name="phone"
          placeholder="+54 11 1234-5678"
          value={formData.phone}
          onChange={handleChange}
        />

        <Input
          label="Fecha de nacimiento"
          name="birthdate"
          type="date"
          value={formData.birthdate}
          onChange={handleChange}
        />

        <Input
          label="Pastor de área"
          name="pastor_area"
          placeholder="Nombre del pastor de tu área"
          value={formData.pastor_area}
          onChange={handleChange}
        />

        <Input
          label="Líder de"
          name="leader_of"
          placeholder="Grupo o área que liderás"
          value={formData.leader_of}
          onChange={handleChange}
        />

        <div>
          <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-3">
            Instrumentos (seleccioná los que toques)
          </label>
          <div className="grid grid-cols-4 gap-2">
            {INSTRUMENTS.map(inst => (
              <button
                key={inst}
                type="button"
                onClick={() => toggleInstrument(inst)}
                className={`
                  p-2 rounded-lg text-xs transition-all border-2
                  ${formData.instruments.includes(inst)
                    ? 'border-white bg-white/10'
                    : 'border-neutral-800 hover:border-neutral-700'
                  }
                `}
              >
                {inst}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={loading}
            className="flex-1"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Enviando...
              </>
            ) : (
              'Enviar Solicitud'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// Simple Input component
const Input = ({ label, name, type = 'text', placeholder, value, onChange, required }) => (
  <div>
    <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-2">
      {label}
    </label>
    <input
      type={type}
      name={name}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      required={required}
      className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-white transition-colors"
    />
  </div>
);

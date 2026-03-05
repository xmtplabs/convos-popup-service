export function namespaceEnforcement() {
  return (req, res, next) => {
    const pathNamespace = req.params.namespace;
    const tokenNamespace = req.auth?.namespace;

    if (!tokenNamespace || tokenNamespace !== pathNamespace) {
      return res.status(403).json({
        error: 'namespace_mismatch',
        error_description: `Token namespace '${tokenNamespace}' does not match path namespace '${pathNamespace}'`,
      });
    }

    next();
  };
}
